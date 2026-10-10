"use client";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

/**
 * O INVERSO SEGURO de cada ação, para o "Desfazer" do toast (E2/E3 da
 * auditoria). Só onde desfazer devolve EXATAMENTE o estado anterior: fixar e
 * desafixar, marcar e desmarcar como não lida, e silenciar (o menu só oferece
 * silenciar quando a conversa não está silenciada, então o inverso é tirar o
 * silêncio). "Reativar som" não tem inverso: a duração que havia antes não é
 * conhecida aqui, e chutar uma seria inventar.
 */
export function inversoDaAcao(acao: Acao): Acao | null {
  switch (acao.tipo) {
    case "fixar":
      return { tipo: "desafixar" };
    case "desafixar":
      return { tipo: "fixar" };
    case "marcar_nao_lida":
      return { tipo: "desmarcar_nao_lida" };
    case "desmarcar_nao_lida":
      return { tipo: "marcar_nao_lida" };
    case "silenciar":
      return { tipo: "reativar_som" };
    case "reativar_som":
      return null;
  }
}

const MENSAGEM_DA_ACAO: Record<Acao["tipo"], string> = {
  fixar: "Conversa fixada.",
  desafixar: "Conversa desafixada.",
  silenciar: "Conversa silenciada.",
  reativar_som: "Som reativado.",
  marcar_nao_lida: "Marcada como não lida.",
  desmarcar_nao_lida: "Marcada como lida.",
};

async function executar(conversationId: string, acao: Acao): Promise<unknown> {
  const { caminho, metodo } = ROTA[acao.tipo];
  const url = `/api/v1/conversations/${conversationId}/${caminho}`;
  return metodo === "post"
    ? apiClient.post<unknown>(url, acao.tipo === "silenciar" ? { duracao: acao.duracao } : {})
    : apiClient.delete<unknown>(url);
}

function refletir(qc: QueryClient, conversationId: string, acao: Acao): void {
  aplicarEstadoNoCache(qc, conversationId, patchDaAcao(acao));
  invalidarListasDaConversa(qc, conversationId);
  if (acao.tipo === "marcar_nao_lida" || acao.tipo === "desmarcar_nao_lida") {
    void qc.invalidateQueries({ queryKey: ["conversation-counts"] });
  }
}

/**
 * As preferências POR ATENDENTE da conversa. Com `t` (o tradutor), cada ação
 * confirma num toast e, quando há inverso seguro, oferece "Desfazer" ali
 * mesmo. O toast nasce no `onSuccess` do HOOK, e não da chamada: o menu
 * desmonta ao escolher, e callback por chamada não roda depois disso.
 */
export function useEstadoDaConversa(t?: (texto: string) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, acao }: { conversationId: string; acao: Acao }) =>
      executar(conversationId, acao),
    onError: showApiError,
    onSuccess: (_d, { conversationId, acao }) => {
      refletir(qc, conversationId, acao);
      if (!t) return;
      const inverso = inversoDaAcao(acao);
      toast(t(MENSAGEM_DA_ACAO[acao.tipo]), {
        action: inverso
          ? {
              label: t("Desfazer"),
              onClick: () =>
                void executar(conversationId, inverso).then(
                  () => refletir(qc, conversationId, inverso),
                  showApiError,
                ),
            }
          : undefined,
      });
    },
  });
}
