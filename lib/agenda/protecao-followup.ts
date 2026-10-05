import type { SupabaseClient } from "@supabase/supabase-js";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { agendaSettingsSchema } from "@/lib/schemas/settings";
import { logger } from "@/lib/logger";
import { lotesDeIds } from "@/lib/supabase/lotes";

export interface CompromissoProtetor {
  id: string;
  contact_id: string | null;
  revision: number;
  starts_at: string;
  ends_at: string;
  status: string;
}
export type ProtecaoAgenda = {
  adiar: boolean;
  motivo:
    | "sem_compromisso"
    | "agendado"
    | "em_atendimento"
    | "presenca_pendente"
    | "presenca_vencida"
    | "leitura_indisponivel";
  appointment_id: string | null;
  reavaliar_em: string | null;
};
export function protecaoDaAgenda(
  compromissos: CompromissoProtetor[],
  settings: unknown,
  agora: Date,
): ProtecaoAgenda {
  const config = agendaSettingsSchema.parse(settings);
  const agoraMs = agora.getTime();
  const vivos = compromissos.filter((a) => a.status === "pending" || a.status === "confirmed");
  let vencido: CompromissoProtetor | undefined;
  for (const a of vivos.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
    const inicio = Date.parse(a.starts_at),
      fim = Date.parse(a.ends_at);
    const horizonte = fim + config.unknown_protection_minutes * 60_000;
    if (agoraMs >= horizonte) {
      vencido ??= a;
      continue;
    }
    return {
      adiar: true,
      motivo:
        agoraMs < inicio ? "agendado" : agoraMs < fim ? "em_atendimento" : "presenca_pendente",
      appointment_id: a.id,
      reavaliar_em: new Date(
        Math.min(horizonte, Math.max(agoraMs + 60_000, agoraMs < inicio ? inicio : fim)),
      ).toISOString(),
    };
  }
  return {
    adiar: false,
    motivo: vencido ? "presenca_vencida" : "sem_compromisso",
    appointment_id: vencido?.id ?? null,
    reavaliar_em: null,
  };
}
/**
 * O registro da falha é feito UMA vez por leitura, por quem chama (ver
 * `avisarIndisponivel`): esta função monta o resultado de CADA contato, e logar
 * aqui escrevia uma linha por contato — 1.097 por rodada do observador de risco
 * na Lior, 11,5 mil linhas em 2 h, todas iguais e sem dizer o que falhou.
 */
function indisponivel(agora: Date): ProtecaoAgenda {
  return {
    adiar: true,
    motivo: "leitura_indisponivel",
    appointment_id: null,
    reavaliar_em: new Date(agora.getTime() + 60_000).toISOString(),
  };
}
function avisarIndisponivel(erro: unknown, contatos: number): void {
  logger.warn("[agenda] proteção indisponível; cobrança adiada", {
    contatos,
    erro: erro instanceof Error ? erro.message : ((erro as { message?: string })?.message ?? String(erro)),
  });
}

/**
 * A leitura vai em LOTES de contatos.
 *
 * `.in("contact_id", contatos)` vira query string: com os 1.097 contatos de
 * negócio aberto da Lior (o observador de risco e o radar pedem todos de uma
 * vez) a URL passava de 40 KB e o gateway respondia 400. A função devolvia
 * "indisponível" para todos, o radar abortava, e a rodada seguinte, 15 minutos
 * depois, repetia o mesmo 400 — para sempre. Com lotes de `IDS_POR_CONSULTA`
 * (medição em `lib/supabase/lotes.ts`) cada URL fica em ~6 KB.
 */
export async function protecaoAgendaSupabase(
  db: SupabaseClient,
  org: string,
  contatos: string[],
  agora = new Date(),
): Promise<Map<string, ProtecaoAgenda>> {
  if (!contatos.length) return new Map();
  try {
    const appointments: CompromissoProtetor[] = [];
    for (const lote of lotesDeIds([...new Set(contatos)])) {
      let after: string | undefined;
      // Keyset estável: uma resposta bem-sucedida pode ter sido truncada pelo
      // max_rows do PostgREST. Só página VAZIA prova que a leitura terminou.
      for (;;) {
        let query = db
          .from("calendar_appointments")
          .select("id,contact_id,revision,starts_at,ends_at,status")
          .eq("organization_id", org)
          .in("contact_id", lote)
          .in("status", ["pending", "confirmed"])
          .order("id", { ascending: true })
          .limit(500);
        if (after) query = query.gt("id", after);
        const page = await query;
        if (page.error) throw page.error;
        if (!page.data?.length) break;
        const last = page.data[page.data.length - 1]!.id;
        if (after && last <= after) throw new Error("agenda_page_did_not_advance");
        appointments.push(...page.data);
        after = last;
      }
    }
    const organization = await db.from("organizations").select("settings").eq("id", org).single();
    if (organization.error) throw organization.error;
    return new Map(
      contatos.map((id) => [
        id,
        protecaoDaAgenda(
          appointments.filter((a) => a.contact_id === id),
          organization.data.settings?.agenda,
          agora,
        ),
      ]),
    );
  } catch (erro) {
    avisarIndisponivel(erro, contatos.length);
    return new Map(contatos.map((id) => [id, indisponivel(agora)]));
  }
}
export async function protecaoAgendaPg(
  db: Queryable,
  org: string,
  contact: string,
  agora = new Date(),
): Promise<ProtecaoAgenda> {
  try {
    const [appointments, organization] = await Promise.all([
      db.query<CompromissoProtetor>(
        "select id,contact_id,revision::float8,starts_at::text,ends_at::text,status from calendar_appointments where organization_id=$1 and contact_id=$2 and status in ('pending','confirmed')",
        [org, contact],
      ),
      db.query<{ settings: { agenda?: unknown } }>(
        "select settings from organizations where id=$1",
        [org],
      ),
    ]);
    if (!organization.rows[0]) throw new Error("agenda_org_missing");
    return protecaoDaAgenda(appointments.rows, organization.rows[0].settings?.agenda, agora);
  } catch (erro) {
    avisarIndisponivel(erro, 1);
    return indisponivel(agora);
  }
}
export class AgendaDeferredError extends Error {
  constructor(public readonly protection: ProtecaoAgenda) {
    super(`agenda:${protection.motivo}`);
    this.name = "AgendaDeferredError";
  }
}
