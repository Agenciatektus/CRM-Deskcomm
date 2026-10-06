/**
 * Etiquetas da conversa por DELTA (migration 9044).
 *
 * O PATCH gravava a lista inteira que a tela tinha carregado, e quem gravava por
 * último vencia: a etiqueta que outra pessoa (ou a IA, por `crm_manage_tags`)
 * pôs no meio sumia. Aqui só viaja o que mudou, e quem aplica é o banco, sobre o
 * valor ATUAL e com a linha travada (`fn_conversa_tags_alterar`).
 *
 * A chamada usa o client da SESSÃO: a função começa por `fn_tags_guarda`, que
 * recusa `auth.uid()` nulo. Com a service key ela não executa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import type { PatchConversationInput } from "@/lib/schemas";

export interface DeltaDeEtiquetas {
  adicionar: string[];
  remover: string[];
}

/** O delta do pedido, ou `null` quando o pedido não mexe em etiqueta por delta. */
export function deltaDoPedido(input: PatchConversationInput): DeltaDeEtiquetas | null {
  if (input.tags_adicionar === undefined && input.tags_remover === undefined) return null;
  return { adicionar: input.tags_adicionar ?? [], remover: input.tags_remover ?? [] };
}

interface ErroDaRpc {
  code?: string;
  message?: string;
}

/** Tradução do erro da função para o contrato da API. Exportada para teste. */
export function erroDoDelta(erro: ErroDaRpc, ctx: HandlerCtx): ApiError {
  const idioma = ctx.idioma ?? "pt-BR";
  const msg = erro.message ?? "";
  if (erro.code === "42501" && /tags_mfa_required/.test(msg))
    return new ApiError(403, "mfa_required", undefined, ctx.requestId,
      traduzir("Confirme a verificação em duas etapas.", idioma));
  if (erro.code === "42501" && /tags_etiqueta_do_sistema/.test(msg))
    return new ApiError(409, "etiqueta_do_sistema", undefined, ctx.requestId,
      traduzir("A etiqueta cliente é do sistema enquanto a regra Clientes pela agenda estiver ligada.", idioma));
  if (erro.code === "42501")
    return new ApiError(403, "forbidden", undefined, ctx.requestId,
      traduzir("Esta sessão não pode mudar as etiquetas desta conversa.", idioma));
  if (erro.code === "P0002")
    return new ApiError(404, "not_found", undefined, ctx.requestId,
      traduzir("Conversa não encontrada.", idioma));
  if (erro.code === "23514")
    return new ApiError(422, "validation_failed", undefined, ctx.requestId,
      traduzir("Limite de 20 etiquetas por conversa.", idioma));
  if (erro.code === "22023")
    return new ApiError(422, "validation_failed", undefined, ctx.requestId,
      traduzir("Confira as etiquetas.", idioma));
  // O texto do banco fica no log do servidor, nunca na resposta.
  logger.error("[conversations.tags-delta] fn_conversa_tags_alterar falhou", {
    requestId: ctx.requestId,
    code: erro.code,
    message: msg,
  });
  return new ApiError(500, "internal_error", undefined, ctx.requestId,
    traduzir("Não foi possível alterar as etiquetas.", idioma));
}

/** Aplica o delta no banco e devolve a lista que ficou gravada. */
export async function alterarEtiquetasDaConversa(
  supabase: SupabaseClient,
  ctx: HandlerCtx,
  conversationId: string,
  delta: DeltaDeEtiquetas,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("fn_conversa_tags_alterar", {
    p_org: ctx.organization_id,
    p_conversa: conversationId,
    p_adicionar: delta.adicionar,
    p_remover: delta.remover,
  });
  if (error) throw erroDoDelta(error, ctx);
  return (data ?? []) as string[];
}

/** O que o audit registra: o delta pedido e a lista que ficou. */
export function metadataDoDelta(delta: DeltaDeEtiquetas, tags: string[] | null | undefined) {
  return { tags_adicionar: delta.adicionar, tags_remover: delta.remover, tags: tags ?? [] };
}
