"use client";
import { useCallback } from "react";

import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useEstadoDaConversa } from "@/hooks/inbox/useEstadoDaConversa";

/**
 * Os atalhos "u" (marcar como não lida) e "p" (fixar/desafixar) da conversa
 * SELECIONADA (migration 9042). Sem conversa, ou em suporte somente leitura,
 * devolve `undefined` e o atalho fica desligado.
 */
export function useAtalhosPessoais(conversa: ConversationWithContact | null | undefined, somenteLeitura: boolean) {
  const estado = useEstadoDaConversa();
  const { mutate } = estado;
  const id = conversa?.id ?? null;
  const fixada = !!conversa?.pinned;
  const marcarNaoLida = useCallback(() => {
    if (id) mutate({ conversationId: id, acao: { tipo: "marcar_nao_lida" } });
  }, [id, mutate]);
  const alternarFixada = useCallback(() => {
    if (id) mutate({ conversationId: id, acao: { tipo: fixada ? "desafixar" : "fixar" } });
  }, [id, fixada, mutate]);
  if (!id || somenteLeitura) return { onMarkUnread: undefined, onTogglePin: undefined };
  return { onMarkUnread: marcarNaoLida, onTogglePin: alternarFixada };
}
