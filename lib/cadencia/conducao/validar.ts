import type { SupabaseClient } from "@supabase/supabase-js";

import { PISO_DE_TETO_CENTS } from "@/lib/agent-engine/edge/llm/orcamento";
import { obrigatoriasFaltando } from "./presets";
import { conducaoDe, conducaoIlegivel, type ConducaoPorIa } from "./settings";

export interface ErroDaConducao {
  node_id: null;
  code: string;
  message: string;
}

/** O que a validação precisa ler do banco, já lido. `null` = não encontrado. */
export interface DadosDaConducao {
  /** `organizations.settings.cadencia_ia === true` (flag do rollout, ligada por SQL). */
  iaLigada: boolean;
  agente: {
    archived_at: string | null;
    operation_mode: string | null;
    published_version_id: string | null;
  } | null;
  versao: {
    agent_id: string;
    status: string;
    tool_ids: string[] | null;
    pipeline_ids: string[] | null;
  } | null;
  etapaAlvo: {
    pipeline_id: string;
    is_lost: boolean | null;
    is_archived: boolean | null;
  } | null;
  orcamento: {
    enforcement_mode: string | null;
    monthly_limit_cents: number | null;
    enforcement_effective_at: string | null;
  } | null;
}

/**
 * REGRA PURA da publicação com IA. Só roda quando `quem_atende === 'ia'`; com
 * `atendente` não há nada a exigir.
 *
 * O template de disclosure NÃO é exigido (decisão do Peterson, 25/09): quando
 * existe, o gate conta a partir da abertura da condução. O orçamento de IA
 * bloqueante é: sem ele, uma cadência de volume pode queimar o mês em LLM.
 */
export function avaliarConducao(
  conducao: ConducaoPorIa,
  contexto: { pipelineId: string | null; etapaDoGatilho: string | null },
  dados: DadosDaConducao,
): ErroDaConducao[] {
  const erros: ErroDaConducao[] = [];
  const erro = (code: string, message: string) => erros.push({ node_id: null, code, message });

  if (!dados.iaLigada) {
    erro(
      "cadencia_ia_desligada",
      "O atendimento por IA na cadência ainda não está liberado para esta organização. Escolha um atendente humano.",
    );
  }

  const agente = dados.agente;
  const versao = dados.versao;
  const versaoValida =
    agente !== null &&
    agente.archived_at === null &&
    agente.published_version_id !== null &&
    versao !== null &&
    versao.agent_id === conducao.agent_id &&
    versao.status === "published";
  if (!versaoValida) {
    erro("cadencia_agente_invalido", "O agente de IA escolhido não existe, foi arquivado ou não está publicado.");
  } else {
    if (conducao.modo === "automatico" && agente.operation_mode !== "automatic") {
      erro(
        "cadencia_agente_assistido_exige_modo_assistido",
        "Este agente trabalha no modo assistido. Escolha o modo assistido na cadência ou outro agente.",
      );
    }
    if (!contexto.pipelineId || !(versao.pipeline_ids ?? []).includes(contexto.pipelineId)) {
      erro("cadencia_agente_fora_do_funil", "O agente de IA escolhido não tem permissão para mexer neste funil.");
    }
    if (obrigatoriasFaltando(conducao.preset, versao.tool_ids ?? []).length > 0) {
      erro(
        "cadencia_agente_sem_ferramentas_do_objetivo",
        "O agente de IA escolhido não tem as ferramentas que este objetivo exige (mover o negócio de etapa e, para agendar, marcar na agenda).",
      );
    }
  }

  const etapa = dados.etapaAlvo;
  if (
    etapa === null ||
    etapa.pipeline_id !== contexto.pipelineId ||
    etapa.is_archived === true ||
    etapa.is_lost === true ||
    conducao.etapa_alvo_id === contexto.etapaDoGatilho
  ) {
    erro(
      "cadencia_etapa_alvo_invalida",
      "A etapa até onde a IA conduz tem de ser deste funil, ativa, diferente da etapa que dispara a cadência e não pode ser de perda.",
    );
  }

  const o = dados.orcamento;
  const orcamentoOk =
    o !== null &&
    o.enforcement_mode === "bloquear" &&
    typeof o.monthly_limit_cents === "number" &&
    o.monthly_limit_cents >= PISO_DE_TETO_CENTS &&
    o.enforcement_effective_at !== null;
  if (!orcamentoOk) {
    erro(
      "cadencia_orcamento_de_ia",
      "Para a IA atender na cadência, defina um teto mensal de gasto com IA no modo bloquear (Configurações de uso).",
    );
  }

  return erros;
}

/** A etapa que dispara a cadência: só o gatilho de etapa tem uma. */
export function etapaDoGatilho(triggerConfig: unknown): string | null {
  const t = triggerConfig as { kind?: string; params?: { stage_id?: string } } | null;
  return t?.kind === "stage_change" && typeof t.params?.stage_id === "string" ? t.params.stage_id : null;
}

async function umaLinha<T>(
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data as T | null) ?? null;
}

/** Lê do banco o que `avaliarConducao` precisa. */
export async function carregarDadosDaConducao(
  admin: SupabaseClient,
  organizationId: string,
  conducao: ConducaoPorIa,
): Promise<DadosDaConducao> {
  const [org, agente, etapaAlvo, orcamento] = await Promise.all([
    umaLinha<{ settings: Record<string, unknown> | null }>(
      admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
    ),
    umaLinha<NonNullable<DadosDaConducao["agente"]>>(
      admin
        .from("ai_agents")
        .select("archived_at, operation_mode, published_version_id")
        .eq("organization_id", organizationId)
        .eq("id", conducao.agent_id)
        .maybeSingle(),
    ),
    umaLinha<NonNullable<DadosDaConducao["etapaAlvo"]>>(
      admin
        .from("crm_stages")
        .select("pipeline_id, is_lost, is_archived")
        .eq("organization_id", organizationId)
        .eq("id", conducao.etapa_alvo_id)
        .maybeSingle(),
    ),
    umaLinha<NonNullable<DadosDaConducao["orcamento"]>>(
      admin
        .from("ai_budgets")
        .select("enforcement_mode, monthly_limit_cents, enforcement_effective_at")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ),
  ]);

  const versao = agente?.published_version_id
    ? await umaLinha<NonNullable<DadosDaConducao["versao"]>>(
        admin
          .from("ai_agent_versions")
          .select("agent_id, status, tool_ids, pipeline_ids")
          .eq("organization_id", organizationId)
          .eq("id", agente.published_version_id)
          .maybeSingle(),
      )
    : null;

  return {
    iaLigada: org?.settings?.cadencia_ia === true,
    agente,
    versao,
    etapaAlvo,
    orcamento,
  };
}

/**
 * Checagem de RASCUNHO (PATCH), no molde de `validarEtapasDeSaida`: a etapa-alvo
 * é deste funil, ativa, não é de perda nem a do gatilho; o agente é desta
 * organização e não está arquivado. O resto (publicado, modo, ferramentas,
 * orçamento) é regra de publicação: o rascunho pode estar a meio caminho.
 */
export async function validarConducaoDoRascunho(
  db: SupabaseClient,
  organizationId: string,
  pipelineId: string | null,
  conducao: ConducaoPorIa,
  etapaDoGatilhoAtual: string | null,
): Promise<string | null> {
  if (!pipelineId) return "A cadência precisa pertencer a um funil.";
  if (conducao.etapa_alvo_id === etapaDoGatilhoAtual) {
    return "A etapa até onde a IA conduz não pode ser a mesma que dispara a cadência.";
  }
  const etapa = await umaLinha<{ pipeline_id: string; is_lost: boolean | null; is_archived: boolean | null }>(
    db
      .from("crm_stages")
      .select("pipeline_id, is_lost, is_archived")
      .eq("organization_id", organizationId)
      .eq("id", conducao.etapa_alvo_id)
      .maybeSingle(),
  );
  if (!etapa || etapa.pipeline_id !== pipelineId) return "A etapa até onde a IA conduz não é deste funil.";
  if (etapa.is_archived) return "A etapa até onde a IA conduz está arquivada.";
  if (etapa.is_lost) return "A etapa até onde a IA conduz não pode ser de perda.";
  const agente = await umaLinha<{ archived_at: string | null }>(
    db
      .from("ai_agents")
      .select("archived_at")
      .eq("organization_id", organizationId)
      .eq("id", conducao.agent_id)
      .maybeSingle(),
  );
  if (!agente || agente.archived_at) return "O agente de IA escolhido não existe nesta organização.";
  return null;
}

/**
 * Erros de publicação ligados à condução da cadência. Com `atendente` (ou sem
 * condução gravada) devolve vazio sem ler nada.
 */
export async function validarConducaoDaCadencia(
  admin: SupabaseClient,
  organizationId: string,
  pointer: { pipeline_id: string | null; cadence_settings: unknown; trigger_config: unknown },
): Promise<ErroDaConducao[]> {
  if (conducaoIlegivel(pointer.cadence_settings)) {
    return [
      {
        node_id: null,
        code: "cadencia_conducao_invalida",
        message: "Revise quem atende quando o lead responde: a configuração está incompleta.",
      },
    ];
  }
  const conducao = conducaoDe(pointer.cadence_settings);
  if (conducao.quem_atende !== "ia") return [];
  const dados = await carregarDadosDaConducao(admin, organizationId, conducao);
  return avaliarConducao(
    conducao,
    { pipelineId: pointer.pipeline_id, etapaDoGatilho: etapaDoGatilho(pointer.trigger_config) },
    dados,
  );
}
