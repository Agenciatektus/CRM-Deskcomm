import type { SupabaseClient } from "@supabase/supabase-js";

import type { FlowGraph } from "@/lib/followup/graph-schema";
import { VARIAVEIS_DA_CADENCIA, resolverSpintax, variaveisCitadas } from "./render";
import { cadenceSettingsSchema } from "./settings";

export interface ErroDePublicacaoDaCadencia {
  node_id: string | null;
  code: string;
  message: string;
}

/**
 * O QUE UMA CADÊNCIA PRECISA TER PARA IR AO AR — além da validação de grafo
 * comum (`validateFlowForPublish`), que continua valendo.
 *
 * Tudo aqui é "fluxo morto com cara de vivo" se passar: número desconectado não
 * envia, etapa de outro funil nunca casa, variável com erro de digitação zera a
 * régua na primeira mensagem. A recusa é na publicação porque é o momento em
 * que há um humano na tela para corrigir.
 */
export async function validarPublicacaoDaCadencia(
  admin: SupabaseClient,
  organizationId: string,
  pointer: {
    pipeline_id: string | null;
    channel_session_id: string | null;
    cadence_settings: unknown;
    trigger_config: unknown;
  },
  grafo: FlowGraph,
): Promise<ErroDePublicacaoDaCadencia[]> {
  const erros: ErroDePublicacaoDaCadencia[] = [];
  const erro = (code: string, message: string, node_id: string | null = null) =>
    erros.push({ node_id, code, message });

  const settings = cadenceSettingsSchema.safeParse(pointer.cadence_settings);
  if (!settings.success) {
    erro(
      "cadencia_politica_incompleta",
      "Complete a política de envio: dias e horário, intervalo entre mensagens, base legal (LIA) e limite de inscrições por dia.",
    );
  }

  if (!pointer.pipeline_id) erro("cadencia_sem_funil", "A cadência precisa pertencer a um funil.");

  if (!pointer.channel_session_id) {
    erro("cadencia_sem_numero", "Escolha o número de WhatsApp pelo qual a cadência envia.");
  } else {
    const { data: sessao, error } = await admin
      .from("channel_sessions")
      .select("id, status, archived_at")
      .eq("organization_id", organizationId)
      .eq("id", pointer.channel_session_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sessao || sessao.archived_at) {
      erro("cadencia_numero_inexistente", "O número escolhido não existe mais nesta organização.");
    } else if (sessao.status !== "WORKING") {
      erro("cadencia_numero_desconectado", "O número escolhido está desconectado. Reconecte antes de publicar.");
    }
  }

  // Etapas citadas (gatilho e passos "mover para") TÊM de ser do funil da cadência.
  const etapas = new Set<string>();
  const trigger = pointer.trigger_config as { kind?: string; params?: { stage_id?: string } } | null;
  if (trigger?.kind === "stage_change" && trigger.params?.stage_id) etapas.add(trigger.params.stage_id);
  for (const no of grafo.nodes) {
    if (no.type === "action" && no.config.mode === "move_stage") etapas.add(no.config.stage_id);
  }
  if (etapas.size > 0 && pointer.pipeline_id) {
    const { data: linhas, error } = await admin
      .from("crm_stages")
      .select("id, pipeline_id, is_lost, is_archived")
      .eq("organization_id", organizationId)
      .in("id", [...etapas]);
    if (error) throw new Error(error.message);
    const porId = new Map((linhas ?? []).map((l) => [l.id as string, l]));
    for (const id of etapas) {
      const e = porId.get(id);
      if (!e || e.pipeline_id !== pointer.pipeline_id) {
        erro("cadencia_etapa_fora_do_funil", "Uma etapa usada na cadência não é deste funil.");
      } else if (e.is_archived) {
        erro("cadencia_etapa_arquivada", "Uma etapa usada na cadência está arquivada.");
      }
    }
    for (const no of grafo.nodes) {
      if (no.type === "action" && no.config.mode === "move_stage" && porId.get(no.config.stage_id)?.is_lost) {
        erro(
          "cadencia_etapa_de_perda",
          "Passo automático não pode mover para etapa de perda: ela exige um motivo que a régua não tem.",
          no.id,
        );
      }
    }
  }

  // Texto: variáveis do contrato e spintax bem formado — em TODAS as variantes.
  for (const no of grafo.nodes) {
    if (no.type !== "action" || no.config.mode !== "text") continue;
    for (const variante of [no.config.body, ...(no.config.variants ?? [])]) {
      const desconhecidas = variaveisCitadas(variante).filter(
        (v) => !(VARIAVEIS_DA_CADENCIA as readonly string[]).includes(v),
      );
      if (desconhecidas.length > 0) {
        erro(
          "cadencia_variavel_desconhecida",
          `Variável desconhecida: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}. Use ${VARIAVEIS_DA_CADENCIA.map((v) => `{{${v}}}`).join(", ")}.`,
          no.id,
        );
      }
      if (resolverSpintax(variante, () => 0) === null) {
        erro("cadencia_spintax_invalido", "Há uma variação {a|b} sem fechar, ou aninhada demais.", no.id);
      }
    }
  }

  return erros;
}
