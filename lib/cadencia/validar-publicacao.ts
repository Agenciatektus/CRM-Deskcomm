import type { SupabaseClient } from "@supabase/supabase-js";

import type { FlowGraph } from "@/lib/followup/graph-schema";
import { VARIANTE_TAMANHO_MAXIMO, VARIAVEIS_DA_CADENCIA, resolverSpintax, variaveisCitadas } from "./render";
import { validarEtapasDeSaida } from "./gatilho";
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

  const etapasDeSaida = settings.success ? (settings.data.saidas?.etapas ?? []) : [];
  if (pointer.pipeline_id && etapasDeSaida.length > 0) {
    const problema = await validarEtapasDeSaida(admin, organizationId, pointer.pipeline_id, etapasDeSaida);
    if (problema) erro("cadencia_saida_invalida", problema);
  }

  if (!pointer.channel_session_id) {
    erro("cadencia_sem_numero", "Escolha o número de WhatsApp pelo qual a cadência envia.");
  } else {
    const { data: sessao, error } = await admin
      .from("channel_sessions")
      .select("id, status, archived_at, daily_message_limit")
      .eq("organization_id", organizationId)
      .eq("id", pointer.channel_session_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sessao || sessao.archived_at) {
      erro("cadencia_numero_inexistente", "O número escolhido não existe mais nesta organização.");
    } else if (sessao.status !== "WORKING") {
      erro("cadencia_numero_desconectado", "O número escolhido está desconectado. Reconecte antes de publicar.");
    }
    // Inscrever mais gente por dia do que o número manda por dia só cria conversa
    // aberta esperando cota — a fila cresce e ninguém recebe.
    const limite = (sessao?.daily_message_limit as number | null | undefined) ?? null;
    if (settings.success && limite !== null && settings.data.max_inscricoes_dia > limite) {
      erro(
        "cadencia_teto_acima_da_cota",
        `O limite de novas inscrições por dia (${settings.data.max_inscricoes_dia}) passa do limite diário do número (${limite}).`,
      );
    }
  }

  // LISTA POSITIVA do que uma cadência executa. Tudo que envia precisa passar
  // pela política dela (cota, espaçamento, LGPD de prospecção, rodapé) — e o motor
  // só a aplica ao passo de TEXTO. Classificação por IA, mensagem gerada por IA e
  // modelo pronto sairiam sem nada disso: são recusados aqui.
  for (const no of grafo.nodes) {
    const permitido =
      no.type === "trigger" ||
      no.type === "wait" ||
      no.type === "end" ||
      (no.type === "action" && (no.config.mode === "text" || no.config.mode === "move_stage" || no.config.mode === "tag"));
    if (!permitido) {
      erro(
        "cadencia_passo_nao_suportado",
        "A cadência aceita mensagem de texto, espera, mover de etapa e etiqueta. Remova os outros passos.",
        no.id,
      );
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

  // "Mover para" a PRÓPRIA etapa do gatilho reinscreveria o lead ao terminar a
  // régua — um laço limitado só pelo teto do dia.
  const etapaDoGatilho = trigger?.kind === "stage_change" ? trigger.params?.stage_id : undefined;
  for (const no of grafo.nodes) {
    if (no.type === "action" && no.config.mode === "move_stage" && no.config.stage_id === etapaDoGatilho) {
      erro(
        "cadencia_move_para_o_gatilho",
        "Um passo move o negócio para a mesma etapa que dispara a cadência: ele entraria de novo em laço.",
        no.id,
      );
    }
  }

  // Texto: variáveis do contrato e spintax bem formado — em TODAS as variantes.
  for (const no of grafo.nodes) {
    if (no.type !== "action" || no.config.mode !== "text") continue;
    for (const variante of [no.config.body, ...(no.config.variants ?? [])]) {
      if (variante.length > VARIANTE_TAMANHO_MAXIMO) {
        erro(
          "cadencia_texto_longo",
          `Cada variação pode ter até ${VARIANTE_TAMANHO_MAXIMO} caracteres.`,
          no.id,
        );
      }
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
