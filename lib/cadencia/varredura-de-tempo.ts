import type { SupabaseClient } from "@supabase/supabase-js";

import { inscreverPorGatilho, type ResultadoDaInscricao } from "./inscrever";

/**
 * GATILHOS DE TEMPO DA CADÊNCIA — a varredura que roda no tick do follow-up.
 *
 *   - `agent_sla`: o cliente escreveu e ninguém respondeu há N minutos
 *     (`awaiting_since`, a mesma régua da Fila e da pílula "Aguardando há…");
 *   - `lead_idle`: nós falamos por último e o lead não responde há N minutos.
 *
 * ⚠️ QUEM ESTÁ ESPERANDO QUEM é decidido AQUI, no código, comparando
 * `last_inbound_at` com `last_outbound_at`: o PostgREST não compara duas colunas.
 * O banco só entrega os candidatos da JANELA de tempo; a condição que importa
 * é `quemEsperaQuem`, pura e testada.
 *
 * ⚠️ JANELA DE 24 h, NÃO "TODOS OS ATRASADOS". Uma conversa entra quando o
 * limiar passa e continua candidata por um dia — o tick é de minuto, então a
 * pega. Sem o teto, toda conversa esquecida há meses seria relida a cada minuto
 * para sempre (a porta a recusaria, mas o custo ficaria). E a porta também não
 * retroage: o instante da violação (`eventoEm`) tem de ser posterior à
 * publicação da cadência.
 */

export type TipoDeTempo = "agent_sla" | "lead_idle";

export interface CadenciaDeTempo {
  id: string;
  organization_id: string;
  pipeline_id: string;
  channel_session_id: string;
  tipo: TipoDeTempo;
  limiar_min: number;
}

export interface ConversaCandidata {
  id: string;
  contact_id: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  awaiting_since: string | null;
}

export const JANELA_DE_CAPTURA_MS = 24 * 60 * 60_000;
export const MAX_CONVERSAS_POR_CADENCIA = 50;
const STATUS_EM_ATENDIMENTO = ["open", "pending", "claimed", "ai_handling"];

const ms = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);

/**
 * A conversa VIOLOU o limiar deste tipo? Devolve o instante da violação
 * (`referência + limiar`), ou `null`.
 */
export function quemEsperaQuem(
  tipo: TipoDeTempo,
  conversa: ConversaCandidata,
  agora: Date,
  limiarMin: number,
): string | null {
  const limiar = limiarMin * 60_000;
  const entrou = ms(conversa.last_inbound_at);
  const saiu = ms(conversa.last_outbound_at);
  if (tipo === "agent_sla") {
    // A bola está com o TIME: o cliente falou por último.
    if (entrou === null || (saiu !== null && saiu >= entrou)) return null;
    const desde = ms(conversa.awaiting_since) ?? entrou;
    return agora.getTime() - desde >= limiar ? new Date(desde + limiar).toISOString() : null;
  }
  // lead_idle — a bola está com o LEAD: nós falamos por último.
  if (saiu === null || (entrou !== null && entrou >= saiu)) return null;
  return agora.getTime() - saiu >= limiar ? new Date(saiu + limiar).toISOString() : null;
}

export interface VarreduraDeTempoDb {
  cadenciasDeTempo(): Promise<CadenciaDeTempo[]>;
  candidatas(c: CadenciaDeTempo, desde: string, ate: string): Promise<ConversaCandidata[]>;
  negocioAbertoDoContato(orgId: string, contactId: string, pipelineId: string): Promise<string | null>;
}

export interface VarreduraDeTempoDeps {
  db: VarreduraDeTempoDb;
  inscrever: (input: {
    organizationId: string;
    pointerId: string;
    leadId: string;
    eventoEm: string;
    origem: "gatilho_tempo";
    conversationId: string;
  }) => Promise<ResultadoDaInscricao>;
  clock: () => Date;
}

export interface ResumoDaVarreduraDeTempo {
  cadencias: number;
  candidatas: number;
  inscritos: number;
  recusas: Record<string, number>;
}

export async function varrerGatilhosDeTempo(deps: VarreduraDeTempoDeps): Promise<ResumoDaVarreduraDeTempo> {
  const resumo: ResumoDaVarreduraDeTempo = { cadencias: 0, candidatas: 0, inscritos: 0, recusas: {} };
  const agora = deps.clock();
  const cadencias = await deps.db.cadenciasDeTempo();
  resumo.cadencias = cadencias.length;
  for (const c of cadencias) {
    const limiar = c.limiar_min * 60_000;
    const ate = new Date(agora.getTime() - limiar).toISOString();
    const desde = new Date(agora.getTime() - limiar - JANELA_DE_CAPTURA_MS).toISOString();
    const conversas = await deps.db.candidatas(c, desde, ate);
    for (const conversa of conversas) {
      const eventoEm = quemEsperaQuem(c.tipo, conversa, agora, c.limiar_min);
      if (!eventoEm) continue;
      resumo.candidatas++;
      const leadId = await deps.db.negocioAbertoDoContato(c.organization_id, conversa.contact_id, c.pipeline_id);
      if (!leadId) {
        resumo.recusas.sem_negocio_no_funil = (resumo.recusas.sem_negocio_no_funil ?? 0) + 1;
        continue;
      }
      const r = await deps.inscrever({
        organizationId: c.organization_id,
        pointerId: c.id,
        leadId,
        eventoEm,
        origem: "gatilho_tempo",
        conversationId: conversa.id,
      });
      if (r.ok) resumo.inscritos++;
      else resumo.recusas[r.motivo] = (resumo.recusas[r.motivo] ?? 0) + 1;
    }
  }
  return resumo;
}

export function createSupabaseVarreduraDeTempoDb(admin: SupabaseClient): VarreduraDeTempoDb {
  return {
    async cadenciasDeTempo() {
      const { data, error } = await admin
        .from("followup_flow_pointers")
        .select("id, organization_id, pipeline_id, channel_session_id, trigger_config")
        .eq("surface", "cadence")
        .eq("status", "active")
        .in("trigger_config->>kind", ["agent_sla", "lead_idle"]);
      if (error) throw new Error(`cadencia_tempo_pointers: ${error.message}`);
      return (data ?? []).flatMap((p) => {
        const t = p.trigger_config as { kind?: string; params?: { threshold_minutes?: unknown } } | null;
        const limiar = t?.params?.threshold_minutes;
        if ((t?.kind !== "agent_sla" && t?.kind !== "lead_idle") || typeof limiar !== "number") return [];
        if (!p.pipeline_id || !p.channel_session_id) return [];
        return [
          {
            id: p.id as string,
            organization_id: p.organization_id as string,
            pipeline_id: p.pipeline_id as string,
            channel_session_id: p.channel_session_id as string,
            tipo: t.kind,
            limiar_min: limiar,
          },
        ];
      });
    },
    async candidatas(c, desde, ate) {
      const coluna = c.tipo === "agent_sla" ? "awaiting_since" : "last_outbound_at";
      const { data, error } = await admin
        .from("conversations")
        .select("id, contact_id, last_inbound_at, last_outbound_at, awaiting_since")
        .eq("organization_id", c.organization_id)
        .eq("channel_session_id", c.channel_session_id)
        .in("status", STATUS_EM_ATENDIMENTO)
        .not("contact_id", "is", null)
        .gte(coluna, desde)
        .lte(coluna, ate)
        .order(coluna, { ascending: true })
        .limit(MAX_CONVERSAS_POR_CADENCIA);
      if (error) throw new Error(`cadencia_tempo_conversas: ${error.message}`);
      return (data ?? []) as ConversaCandidata[];
    },
    async negocioAbertoDoContato(orgId, contactId, pipelineId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .eq("pipeline_id", pipelineId)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`cadencia_tempo_negocio: ${error.message}`);
      return (data?.id as string | undefined) ?? null;
    },
  };
}

/** Adapter de produção: a porta única da cadência com o client de service role. */
export function depsDaVarreduraDeTempo(admin: SupabaseClient): VarreduraDeTempoDeps {
  return {
    db: createSupabaseVarreduraDeTempoDb(admin),
    inscrever: (input) => inscreverPorGatilho(admin, input),
    clock: () => new Date(),
  };
}
