import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { inscreverPorGatilho, type ResultadoDaInscricao } from "./inscrever";
import { normalizarEtiqueta } from "./saidas";

/**
 * GATILHO POR ETIQUETA — a etiqueta posta no negócio (ou no contato) inscreve o
 * negócio na cadência do funil dele.
 *
 * Três decisões que não são óbvias:
 *   1. O FATO manda, não o payload: a etiqueta tem de estar no negócio/contato
 *      AGORA. Posta e tirada em seguida não inscreve ninguém.
 *   2. Etiqueta posta PELA PRÓPRIA CADÊNCIA (passo "Etiqueta", evento com
 *      `metadata.caused_by_cadence`) não inscreve em cadência nenhuma. Uma régua
 *      que etiqueta e outra que dispara por essa etiqueta virariam uma corrente
 *      que ninguém desenhou — o encadeamento, quando quiserem, é pelo funil.
 *   3. Etiqueta no CONTATO inscreve o negócio ABERTO mais recente dele no funil
 *      da cadência. Sem negócio aberto nesse funil, não há o que inscrever: a
 *      cadência é do funil, e a porta dela (`inscreverPorGatilho`) exige negócio.
 *
 * Não retroage: a porta recusa evento anterior à publicação da cadência.
 * O teto do dia, a LGPD e "um fluxo vivo por contato" também são da porta.
 */

export const CADENCIA_GATILHO_ETIQUETA_KEY = "cadencia-gatilho-etiqueta.v1";

export interface CadenciaPorEtiqueta {
  id: string;
  pipeline_id: string;
  tag: string;
}

export interface GatilhoEtiquetaDb {
  cadenciasPorEtiqueta(orgId: string): Promise<CadenciaPorEtiqueta[]>;
  lead(orgId: string, leadId: string): Promise<{ pipeline_id: string; status: string; tags: string[] } | null>;
  tagsDoContato(orgId: string, contactId: string): Promise<string[] | null>;
  negocioAbertoDoContato(orgId: string, contactId: string, pipelineId: string): Promise<string | null>;
}

export interface GatilhoEtiquetaDeps {
  db: GatilhoEtiquetaDb;
  inscrever: (input: {
    organizationId: string;
    pointerId: string;
    leadId: string;
    eventId: string;
    eventoEm: string;
    origem: "gatilho_etiqueta";
  }) => Promise<ResultadoDaInscricao>;
  clock: () => Date;
}

export interface ResumoDoGatilhoEtiqueta {
  cadencias: number;
  inscritos: number;
  recusas: string[];
  ignorado?: "da_propria_cadencia" | "sem_entidade";
}

function tem(tags: readonly string[], alvo: string): boolean {
  const a = normalizarEtiqueta(alvo);
  return tags.some((t) => normalizarEtiqueta(t) === a);
}

export async function aplicarGatilhoPorEtiqueta(
  deps: GatilhoEtiquetaDeps,
  row: EventRow,
): Promise<ResumoDoGatilhoEtiqueta> {
  const resumo: ResumoDoGatilhoEtiqueta = { cadencias: 0, inscritos: 0, recusas: [] };
  if (!row.entity_id) return { ...resumo, ignorado: "sem_entidade" };
  if (row.metadata?.caused_by_cadence) return { ...resumo, ignorado: "da_propria_cadencia" };

  const cadencias = await deps.db.cadenciasPorEtiqueta(row.organization_id);
  resumo.cadencias = cadencias.length;
  if (cadencias.length === 0) return resumo;

  // Negócio → cadência: o par (cadência, negócio) que a etiqueta autoriza.
  const alvos: Array<{ cadencia: CadenciaPorEtiqueta; leadId: string }> = [];
  if (row.event_type.startsWith("lead.")) {
    const lead = await deps.db.lead(row.organization_id, row.entity_id);
    if (!lead || lead.status !== "open") return resumo;
    for (const c of cadencias) {
      if (c.pipeline_id === lead.pipeline_id && tem(lead.tags, c.tag)) {
        alvos.push({ cadencia: c, leadId: row.entity_id });
      }
    }
  } else if (row.event_type.startsWith("contact.")) {
    const tags = await deps.db.tagsDoContato(row.organization_id, row.entity_id);
    if (!tags) return resumo;
    for (const c of cadencias) {
      if (!tem(tags, c.tag)) continue;
      const leadId = await deps.db.negocioAbertoDoContato(row.organization_id, row.entity_id, c.pipeline_id);
      if (leadId) alvos.push({ cadencia: c, leadId });
    }
  }

  for (const { cadencia, leadId } of alvos) {
    const r = await deps.inscrever({
      organizationId: row.organization_id,
      pointerId: cadencia.id,
      leadId,
      eventId: row.id,
      eventoEm: row.created_at ?? deps.clock().toISOString(),
      origem: "gatilho_etiqueta",
    });
    if (r.ok) resumo.inscritos++;
    else resumo.recusas.push(r.motivo);
  }
  return resumo;
}

export function createSupabaseGatilhoEtiquetaDb(admin: SupabaseClient): GatilhoEtiquetaDb {
  return {
    async cadenciasPorEtiqueta(orgId) {
      const { data, error } = await admin
        .from("followup_flow_pointers")
        .select("id, pipeline_id, trigger_config")
        .eq("organization_id", orgId)
        .eq("surface", "cadence")
        .eq("status", "active")
        .eq("trigger_config->>kind", "tag_added");
      if (error) throw new Error(`cadencia_gatilho_etiqueta: ${error.message}`);
      return (data ?? []).flatMap((p) => {
        const tag = (p.trigger_config as { params?: { tag?: unknown } } | null)?.params?.tag;
        return typeof tag === "string" && tag.trim() && p.pipeline_id
          ? [{ id: p.id as string, pipeline_id: p.pipeline_id as string, tag }]
          : [];
      });
    },
    async lead(orgId, leadId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("pipeline_id, status, tags")
        .eq("organization_id", orgId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(`cadencia_gatilho_etiqueta_lead: ${error.message}`);
      return data ? { pipeline_id: data.pipeline_id, status: data.status, tags: data.tags ?? [] } : null;
    },
    async tagsDoContato(orgId, contactId) {
      const { data, error } = await admin
        .from("contacts")
        .select("tags")
        .eq("organization_id", orgId)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(`cadencia_gatilho_etiqueta_contato: ${error.message}`);
      return data ? ((data.tags as string[] | null) ?? []) : null;
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
      if (error) throw new Error(`cadencia_gatilho_etiqueta_negocio: ${error.message}`);
      return (data?.id as string | undefined) ?? null;
    },
  };
}

export const cadenciaGatilhoEtiquetaHandler: EventHandler = {
  key: CADENCIA_GATILHO_ETIQUETA_KEY,
  events: ["lead.tag_added", "contact.tag_added"],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const resumo = await aplicarGatilhoPorEtiqueta(
        {
          db: createSupabaseGatilhoEtiquetaDb(admin),
          inscrever: (input) => inscreverPorGatilho(admin, input),
          clock: () => new Date(),
        },
        row,
      );
      return {
        consumer_key: CADENCIA_GATILHO_ETIQUETA_KEY,
        status: resumo.inscritos > 0 ? "ok" : "skipped",
        detail:
          `cadencias=${resumo.cadencias} inscritos=${resumo.inscritos}` +
          (resumo.ignorado ? ` ignorado=${resumo.ignorado}` : "") +
          (resumo.recusas.length ? ` recusas=${resumo.recusas.join(",")}` : ""),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: CADENCIA_GATILHO_ETIQUETA_KEY, status: "error", detail };
    }
  },
};
