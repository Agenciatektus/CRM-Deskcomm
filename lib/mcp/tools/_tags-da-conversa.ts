import type { McpContext } from "../types";

/**
 * 9044: a conversa muda pela porta de SERVIÇO (`fn_conversa_tags_alterar_servico`,
 * só service_role), com a org do ctx. Remover vence acrescentar, como no caminho
 * antigo (que filtrava a remoção depois de juntar); o banco recusaria os dois lados.
 */
export async function alterarTagsDaConversaPeloServico(
  ctx: McpContext,
  conversationId: string,
  adicionar: string[],
  remover: Set<string>,
): Promise<string[]> {
  const { data, error } = await ctx.supabase.rpc("fn_conversa_tags_alterar_servico", {
    p_org: ctx.organizationId,
    p_conversa: conversationId,
    p_adicionar: [...new Set(adicionar)].filter((t) => !remover.has(t)),
    p_remover: [...remover],
  });
  if (error) {
    if (error.code === "P0002") throw new Error("target_not_found");
    if (error.code === "23514") throw new Error("tags_limit_exceeded");
    if (error.code === "22023") throw new Error("tags_invalid");
    throw new Error(error.message);
  }
  return (data ?? []) as string[];
}
