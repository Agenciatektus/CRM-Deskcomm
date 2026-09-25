import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O GATILHO DE UMA CADÊNCIA — só o que a porta dela implementa.
 *
 * `manual` (inscrição pela tela do funil), `stage_change` (negócio entrou numa
 * etapa DO FUNIL DA CADÊNCIA), `tag_added` (etiqueta posta no negócio ou no
 * contato) e os dois de TEMPO (`agent_sla`, `lead_idle`, pela varredura). Qualquer outro — silêncio, caso aberto, fim de
 * conversa — passaria no schema genérico e nunca inscreveria ninguém pela porta
 * da cadência; e, pior, com a cadência NO AR, o gatilho é lido ao vivo.
 *
 * Usada pelas DUAS rotas que gravam `trigger_config` (a da cadência e a genérica
 * de fluxo) e pela publicação: uma regra, três portas.
 *
 * Devolve `null` quando está ok, ou a mensagem para a tela.
 */
export async function validarGatilhoDaCadencia(
  db: SupabaseClient,
  organizationId: string,
  pipelineId: string | null,
  trigger: unknown,
): Promise<string | null> {
  const t = trigger as {
    kind?: string;
    params?: { stage_id?: string; tag?: string; threshold_minutes?: number };
  } | null;
  const kind = t?.kind ?? "manual";
  if (kind === "manual") return null;
  if (kind === "tag_added") {
    const tag = t?.params?.tag?.trim() ?? "";
    if (!tag) return "Escreva a etiqueta que coloca o negócio na cadência.";
    if (tag.length > 60) return "A etiqueta tem no máximo 60 caracteres.";
    return pipelineId ? null : "A cadência precisa pertencer a um funil.";
  }
  if (kind === "agent_sla" || kind === "lead_idle") {
    const minutos = t?.params?.threshold_minutes;
    const [min, max] = kind === "agent_sla" ? [5, 10_080] : [60, 43_200];
    if (typeof minutos !== "number" || !Number.isInteger(minutos) || minutos < min || minutos > max) {
      return kind === "agent_sla"
        ? "O tempo sem resposta do time vai de 5 minutos a 7 dias."
        : "O tempo sem resposta do lead vai de 1 hora a 30 dias.";
    }
    return pipelineId ? null : "A cadência precisa pertencer a um funil.";
  }
  if (kind !== "stage_change") {
    return "Na cadência, use etapa do funil, etiqueta, tempo sem resposta ou a inscrição manual.";
  }
  const stageId = t?.params?.stage_id;
  if (!stageId) return "Escolha a etapa do funil que dispara a cadência.";
  if (!pipelineId) return "A cadência precisa pertencer a um funil.";
  const { data, error } = await db
    .from("crm_stages")
    .select("id, pipeline_id, is_archived, is_lost")
    .eq("organization_id", organizationId)
    .eq("id", stageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.pipeline_id !== pipelineId) return "A etapa escolhida não é deste funil.";
  if (data.is_archived) return "A etapa escolhida está arquivada.";
  if (data.is_lost) return "Etapa de perda não pode disparar uma cadência de prospecção.";
  return null;
}

/**
 * As ETAPAS DE SAÍDA são do funil da cadência e estão ativas? Uma etapa de outro
 * funil nunca seria alcançada pelo negócio inscrito — a saída pareceria
 * configurada e nunca dispararia. Mesma forma de `validarGatilhoDaCadencia`:
 * `null` quando está ok, ou a mensagem para a tela.
 */
export async function validarEtapasDeSaida(
  db: SupabaseClient,
  organizationId: string,
  pipelineId: string | null,
  etapas: readonly string[],
): Promise<string | null> {
  if (etapas.length === 0) return null;
  if (!pipelineId) return "A cadência precisa pertencer a um funil.";
  const { data, error } = await db
    .from("crm_stages")
    .select("id, pipeline_id, is_archived")
    .eq("organization_id", organizationId)
    .in("id", [...new Set(etapas)]);
  if (error) throw new Error(error.message);
  const porId = new Map((data ?? []).map((e) => [e.id as string, e]));
  for (const id of etapas) {
    const e = porId.get(id);
    if (!e || e.pipeline_id !== pipelineId) return "Uma etapa de saída não é deste funil.";
    if (e.is_archived) return "Uma etapa de saída está arquivada.";
  }
  return null;
}
