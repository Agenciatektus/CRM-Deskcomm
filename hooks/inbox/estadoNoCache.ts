"use client";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { estaSilenciada, type EstadoPessoal } from "@/lib/inbox/estado-por-atendente";

/**
 * O estado POR ATENDENTE (migration 9042) nas listas de conversas em cache.
 *
 * As listas (`["conversations", filtros]`) trazem `pinned`, `muted_until` e
 * `marked_unread` da pessoa da sessão. Aqui:
 *   - `silenciadaNoCache` responde ao aviso de mensagem nova se ESTA pessoa
 *     silenciou a conversa (o realtime de `messages` não sabe disso);
 *   - `aplicarEstadoNoCache` corrige a linha assim que a rota confirma, para o
 *     ícone aparecer sem esperar o refetch. A ORDEM (fixada no topo) vem do
 *     servidor, no refetch que o hook agenda em seguida.
 */

type Linha = Record<string, unknown> & { id: string };
type Lista = InfiniteData<{ data: Linha[]; meta?: unknown }>;

function listas(qc: QueryClient) {
  return qc
    .getQueryCache()
    .findAll({ queryKey: ["conversations"] })
    .filter((q) => Array.isArray(q.queryKey) && q.queryKey.length === 2);
}

/** `true` se alguma lista em cache diz que esta pessoa silenciou a conversa. */
export function silenciadaNoCache(qc: QueryClient, conversationId: string, agora: number = Date.now()): boolean {
  for (const q of listas(qc)) {
    const lista = q.state.data as Lista | undefined;
    for (const p of lista?.pages ?? []) {
      const linha = p.data?.find((c) => c.id === conversationId);
      if (linha) return estaSilenciada(linha.muted_until as string | null | undefined, agora);
    }
  }
  return false;
}

/** Corrige no lugar os campos de estado pessoal da conversa em toda lista em cache. */
export function aplicarEstadoNoCache(qc: QueryClient, conversationId: string, patch: Partial<EstadoPessoal>): void {
  for (const q of listas(qc)) {
    qc.setQueryData<Lista>(q.queryKey, (velha) =>
      velha?.pages
        ? {
            ...velha,
            pages: velha.pages.map((p) => ({
              ...p,
              data: (p.data ?? []).map((c) => (c.id === conversationId ? { ...c, ...patch } : c)),
            })),
          }
        : velha,
    );
  }
}
