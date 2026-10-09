"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { invalidarListasDaConversa } from "@/hooks/inbox/cacheDasConversas";
import { aplicarEstadoNoCache } from "@/hooks/inbox/estadoNoCache";
import { apiClient } from "@/lib/api/client";
import { silencioAte, type DuracaoDeSilencio, type EstadoPessoal } from "@/lib/inbox/estado-por-atendente";

/**
 * Fixar, silenciar e marcar como não lida — POR ATENDENTE (migration 9042).
 *
 * Cada ação chama a sua rota (`/pin`, `/mute`, `/mark-unread`; POST aplica,
 * DELETE desfaz). Ao confirmar: a linha é corrigida no cache (o ícone aparece
 * na hora), as listas que mostram a conversa são refeitas (a fixada sobe ao
 * topo pela ordem do servidor) e os contadores, quando a ação mexe em não lidas.
 */
type Acao =
  | { tipo: "fixar" | "desafixar" | "reativar_som" | "marcar_nao_lida" | "desmarcar_nao_lida" }
  | { tipo: "silenciar"; duracao: DuracaoDeSilencio };

const ROTA: Record<Acao["tipo"], { caminho: string; metodo: "post" | "delete" }> = {
  fixar: { caminho: "pin", metodo: "post" },
  desafixar: { caminho: "pin", metodo: "delete" },
  silenciar: { caminho: "mute", metodo: "post" },
  reativar_som: { caminho: "mute", metodo: "delete" },
  marcar_nao_lida: { caminho: "mark-unread", metodo: "post" },
  desmarcar_nao_lida: { caminho: "mark-unread", metodo: "delete" },
};

/** O estado que a linha passa a ter depois da ação. */
export function patchDaAcao(acao: Acao, agora: number = Date.now()): Partial<EstadoPessoal> {
  switch (acao.tipo) {
    case "fixar":
      return { pinned: true };
    case "desafixar":
      return { pinned: false };
    case "silenciar":
      return { muted_until: silencioAte(acao.duracao, agora) };
    case "reativar_som":
      return { muted_until: null };
    case "marcar_nao_lida":
      return { marked_unread: true };
    case "desmarcar_nao_lida":
      return { marked_unread: false };
  }
}

export function useEstadoDaConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, acao }: { conversationId: string; acao: Acao }) => {
      const { caminho, metodo } = ROTA[acao.tipo];
      const url = `/api/v1/conversations/${conversationId}/${caminho}`;
      return metodo === "post"
        ? apiClient.post<unknown>(url, acao.tipo === "silenciar" ? { duracao: acao.duracao } : {})
        : apiClient.delete<unknown>(url);
    },
    onError: showApiError,
    onSuccess: (_d, { conversationId, acao }) => {
      aplicarEstadoNoCache(qc, conversationId, patchDaAcao(acao));
      invalidarListasDaConversa(qc, conversationId);
      if (acao.tipo === "marcar_nao_lida" || acao.tipo === "desmarcar_nao_lida") {
        void qc.invalidateQueries({ queryKey: ["conversation-counts"] });
      }
    },
  });
}
