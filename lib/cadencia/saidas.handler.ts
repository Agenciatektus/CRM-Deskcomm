import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { OUTCOME_DA_SAIDA, motivoDeSaida, saidasDe, type MotivoDeSaida } from "./saidas";

/**
 * SAÍDA DA CADÊNCIA NA HORA DO FATO.
 *
 * Etiqueta posta, etapa mudada, negócio ganho ou perdido: se a régua do lead
 * tem essa condição de saída, ela acaba aqui — sem esperar o próximo envio.
 * (A reconferência antes de cada envio, em `followup-turn.ts`, continua como
 * rede de segurança para o evento que chega atrasado.)
 *
 * O payload do evento só diz QUEM mudou. O QUE o lead tem agora é relido do
 * banco: um `lead.tag_added` fala do que foi acrescentado, e uma etiqueta
 * removida logo depois não pode encerrar ninguém.
 *
 * "Uma pessoa assumiu a conversa" NÃO é avaliado aqui: não há evento de lead
 * para isso, e a checagem antes do envio já cobre (ver `fatosDaSaidaDaInscricao`).
 */

export const CADENCIA_SAIDAS_HANDLER_KEY = "cadencia-saidas.v1";

export const EVENTOS_DE_SAIDA = [
  "lead.stage_changed",
  "lead.won",
  "lead.lost",
  "lead.tag_added",
  "contact.tag_added",
] as const;

const STATUS_VIVOS = ["active", "waiting_reply", "dormente", "paused_handoff", "paused_manual"];

export interface InscricaoDaSaida {
  id: string;
  lead_id: string | null;
  contact_id: string;
  cadence_settings: unknown;
}

export interface SaidasDb {
  inscricoesVivas(orgId: string, alvo: { leadId: string } | { contactId: string }): Promise<InscricaoDaSaida[]>;
  lead(orgId: string, leadId: string): Promise<{ stage_id: string; status: string; tags: string[] } | null>;
  tagsDoContato(orgId: string, contactId: string): Promise<string[]>;
  encerrar(orgId: string, enrollmentId: string, motivo: MotivoDeSaida): Promise<boolean>;
}

export interface ResumoDaSaida {
  avaliadas: number;
  encerradas: number;
  motivos: MotivoDeSaida[];
}

export async function aplicarSaidasDaCadencia(db: SaidasDb, row: EventRow): Promise<ResumoDaSaida> {
  const resumo: ResumoDaSaida = { avaliadas: 0, encerradas: 0, motivos: [] };
  if (!row.entity_id) return resumo;
  // Pelo PREFIXO do evento, não pelo `entity_kind`: as rotas gravam
  // `crm_lead`, mas `lead.won`/`lead.lost` nascem na trigger via
  // `fn_log_event`, que deriva o kind do tipo e grava `lead`. Filtrar por
  // `crm_lead` deixaria o ganho e a perda — as saídas mais comuns — sem efeito.
  const alvo = row.event_type.startsWith("lead.")
    ? { leadId: row.entity_id }
    : row.event_type.startsWith("contact.")
      ? { contactId: row.entity_id }
      : null;
  if (alvo === null) return resumo;

  const inscricoes = await db.inscricoesVivas(row.organization_id, alvo);
  for (const e of inscricoes) {
    resumo.avaliadas++;
    const lead = e.lead_id ? await db.lead(row.organization_id, e.lead_id) : null;
    // Inscrição sem negócio (lead apagado) só sai pela regra de "fechar": sem
    // `lead_id` desde o início não é o caso da cadência, que sempre inscreve negócio.
    if (e.lead_id === null) continue;
    const motivo = motivoDeSaida(saidasDe(e.cadence_settings), {
      lead,
      tagsDoContato: await db.tagsDoContato(row.organization_id, e.contact_id),
      humanoFalouDepois: false,
    });
    if (motivo === null) continue;
    if (await db.encerrar(row.organization_id, e.id, motivo)) {
      resumo.encerradas++;
      resumo.motivos.push(motivo);
    }
  }
  return resumo;
}

export function createSupabaseSaidasDb(admin: SupabaseClient): SaidasDb {
  return {
    async inscricoesVivas(orgId, alvo) {
      let q = admin
        .from("followup_enrollments")
        .select("id, lead_id, contact_id, followup_flow_pointers!inner(surface, cadence_settings)")
        .eq("organization_id", orgId)
        .eq("followup_flow_pointers.surface", "cadence")
        .in("status", STATUS_VIVOS);
      q = "leadId" in alvo ? q.eq("lead_id", alvo.leadId) : q.eq("contact_id", alvo.contactId);
      const { data, error } = await q;
      if (error) throw new Error(`cadencia_saidas_inscricoes: ${error.message}`);
      return (data ?? []).map((r) => {
        const ponteiro = (r as { followup_flow_pointers: unknown }).followup_flow_pointers;
        const p = (Array.isArray(ponteiro) ? ponteiro[0] : ponteiro) as { cadence_settings?: unknown } | null;
        return {
          id: r.id as string,
          lead_id: (r.lead_id as string | null) ?? null,
          contact_id: r.contact_id as string,
          cadence_settings: p?.cadence_settings ?? null,
        };
      });
    },
    async lead(orgId, leadId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("stage_id, status, tags")
        .eq("organization_id", orgId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(`cadencia_saidas_lead: ${error.message}`);
      return data ? { stage_id: data.stage_id, status: data.status, tags: data.tags ?? [] } : null;
    },
    async tagsDoContato(orgId, contactId) {
      const { data, error } = await admin
        .from("contacts")
        .select("tags")
        .eq("organization_id", orgId)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(`cadencia_saidas_contato: ${error.message}`);
      return (data?.tags as string[] | null) ?? [];
    },
    async encerrar(orgId, enrollmentId, motivo) {
      const agora = new Date().toISOString();
      const { data, error } = await admin
        .from("followup_enrollments")
        .update({
          status: "cancelled",
          outcome: OUTCOME_DA_SAIDA[motivo],
          cancel_reason: motivo,
          next_eval_at: null,
          claimed_until: null,
          completed_at: agora,
          updated_at: agora,
        })
        .eq("organization_id", orgId)
        .eq("id", enrollmentId)
        .in("status", STATUS_VIVOS)
        .select("id");
      if (error) throw new Error(`cadencia_saidas_encerrar: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}

export const cadenciaSaidasHandler: EventHandler = {
  key: CADENCIA_SAIDAS_HANDLER_KEY,
  events: [...EVENTOS_DE_SAIDA],
  async handle(row): Promise<HandlerResult> {
    try {
      const resumo = await aplicarSaidasDaCadencia(createSupabaseSaidasDb(createAdminClient()), row);
      return {
        consumer_key: CADENCIA_SAIDAS_HANDLER_KEY,
        status: resumo.encerradas > 0 ? "ok" : "skipped",
        detail: `avaliadas=${resumo.avaliadas} encerradas=${resumo.encerradas}` +
          (resumo.motivos.length ? ` motivos=${resumo.motivos.join(",")}` : ""),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: CADENCIA_SAIDAS_HANDLER_KEY, status: "error", detail };
    }
  },
};
