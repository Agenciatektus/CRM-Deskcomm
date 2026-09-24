import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O GATILHO DE UMA CADÊNCIA — só o que a porta dela implementa.
 *
 * `manual` (inscrição pela tela do funil) e `stage_change` (negócio entrou numa
 * etapa DO FUNIL DA CADÊNCIA). Qualquer outro — silêncio, caso aberto, fim de
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
  const t = trigger as { kind?: string; params?: { stage_id?: string } } | null;
  const kind = t?.kind ?? "manual";
  if (kind === "manual") return null;
  if (kind !== "stage_change") {
    return "Na cadência, use o gatilho Etapa do funil ou a inscrição manual.";
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
