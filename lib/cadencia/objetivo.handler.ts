import type { SupabaseClient } from "@supabase/supabase-js";

import { triggerHandoff } from "@/lib/ai/handoff/orchestrator";
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

import { aplicarObjetivo, EVENTOS_DO_OBJETIVO, type ObjetivoDb } from "./objetivo";

/**
 * A IA DA CADÊNCIA LEVOU O NEGÓCIO ATÉ A ETAPA-ALVO — a condução acaba e uma
 * pessoa assume. Regra em `objetivo.ts` (relê o banco, ignora o payload).
 *
 * A passagem NÃO avisa o lead (`avisarLead: false`): a instrução fixa do
 * objetivo já manda a IA dizer que alguém da equipe dará sequência.
 */

export const CADENCIA_OBJETIVO_HANDLER_KEY = "cadencia-objetivo.v1";

export function createSupabaseObjetivoDb(admin: SupabaseClient): ObjetivoDb {
  return {
    async conducaoVivaDoLead(orgId, leadId) {
      const { data, error } = await admin
        .from("cadencia_conducoes" as never)
        .select("id, conversation_id, contact_id, lead_id, etapa_alvo_id, pointer_id")
        .eq("organization_id", orgId)
        .eq("lead_id", leadId)
        .is("encerrada_em", null)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`cadencia_objetivo_conducao: ${error.message}`);
      return (data as unknown as Awaited<ReturnType<ObjetivoDb["conducaoVivaDoLead"]>>) ?? null;
    },
    async lead(orgId, leadId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("stage_id, status")
        .eq("organization_id", orgId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(`cadencia_objetivo_lead: ${error.message}`);
      return data ? { stage_id: data.stage_id ?? null, status: data.status ?? null } : null;
    },
    async encerrar(orgId, conducaoId) {
      const { data, error } = await admin.rpc("fn_cadencia_encerrar_conducao" as never, {
        p_org: orgId,
        p_conducao: conducaoId,
        p_motivo: "objetivo_atingido",
      } as never);
      if (error) throw new Error(`cadencia_objetivo_encerrar: ${error.message}`);
      return data === true;
    },
    async passarParaHumano(orgId, conducao) {
      const { data } = await admin
        .from("followup_flow_pointers")
        .select("name")
        .eq("organization_id", orgId)
        .eq("id", conducao.pointer_id)
        .maybeSingle();
      const nome = (data as { name?: string } | null)?.name ?? null;
      await triggerHandoff({
        conversationId: conducao.conversation_id,
        organizationId: orgId,
        leadId: conducao.lead_id,
        reason: "objetivo_atingido",
        origem: "cadencia",
        avisarLead: false,
        // A condução acabou de revogar a autorização `cadencia:` do contato; num
        // canal com allowlist isso faria o gate recusar a passagem.
        ignorarGateDeAllowlist: true,
        motivoTexto:
          nome !== null
            ? `A IA da cadência «${nome}» levou o negócio até a etapa-alvo`
            : "A IA da cadência levou o negócio até a etapa-alvo",
        tituloDaCentral: "Objetivo da cadência atingido — assumir a conversa",
        metadata: { conducao_id: conducao.id, pointer_id: conducao.pointer_id },
      });
    },
  };
}

export const cadenciaObjetivoHandler: EventHandler = {
  key: CADENCIA_OBJETIVO_HANDLER_KEY,
  events: [...EVENTOS_DO_OBJETIVO],
  async handle(row): Promise<HandlerResult> {
    try {
      const desfecho = await aplicarObjetivo(createSupabaseObjetivoDb(createAdminClient()), row);
      return {
        consumer_key: CADENCIA_OBJETIVO_HANDLER_KEY,
        status: desfecho === "objetivo_atingido" ? "ok" : "skipped",
        detail: desfecho,
      };
    } catch (err) {
      return {
        consumer_key: CADENCIA_OBJETIVO_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
      };
    }
  },
};
