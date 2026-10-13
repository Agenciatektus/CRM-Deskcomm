"use client";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useArchiveConversation, useCloseConversation, useReopenConversation } from "@/hooks/inbox/useCloseConversation";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { Conversation } from "@/lib/types/messaging";
import { avisarComDesfazer } from "@/lib/ui/aviso-com-desfazer";

type Alvo = Pick<Conversation, "id" | "status" | "service_revision" | "assigned_to_user_id">;

/**
 * FECHAR e ARQUIVAR com "Desfazer" (quadro DS, "Aviso com Desfazer"), no lugar
 * da janela de confirmação: as duas não apagam nada (a conversa volta quando o
 * cliente escreve, e a reabertura existe), então a doutrina da ação destrutiva
 * não pede confirmação, e o quadro pede o aviso de 5 s embaixo.
 *
 * Desfazer usa as rotas que existem: o mesmo PATCH versionado de status, de
 * volta ao status de antes (`open` vira `open`; uma fechada que foi arquivada
 * volta a `closed`). A reabertura não devolve o dono; quando o dono era QUEM
 * desfaz, o `claim` o reaplica. Dono que era outra pessoa não é reatribuído
 * pela tela (seria transferir em nome dela).
 */
export function useEncerrarComDesfazer() {
  const t = useT();
  const { user } = useAuth();
  const fechar = useCloseConversation();
  const arquivar = useArchiveConversation();
  const reabrir = useReopenConversation();

  async function desfazer(alvo: Alvo, depois: Conversation | undefined) {
    const encerradaAntes = alvo.status === "closed" || alvo.status === "archived";
    if (encerradaAntes) {
      // Uma fechada que foi arquivada volta a FECHADA, não aberta.
      await apiClient.patch(`/api/v1/conversations/${alvo.id}`, {
        status: "closed",
        expected_revision: depois?.service_revision,
      });
      return;
    }
    // O mesmo hook da reabertura (relê a lista e a conversa).
    const res = await reabrir.mutateAsync({ conversation_id: alvo.id, expected_revision: depois?.service_revision });
    const eraMeu = !!user?.id && alvo.assigned_to_user_id === user.id;
    if (eraMeu && res?.data?.assigned_to_user_id !== user.id) {
      await apiClient.post(`/api/v1/conversations/${alvo.id}/claim`, { expected_assignee: null });
    }
  }

  function executar(tipo: "fechar" | "arquivar", alvo: Alvo) {
    const args = { conversation_id: alvo.id, expected_revision: alvo.service_revision };
    const mutacao = tipo === "fechar" ? fechar : arquivar;
    mutacao.mutate(args, {
      onSuccess: (res) => {
        avisarComDesfazer(
          tipo === "fechar" ? t("Conversa fechada.") : t("Conversa arquivada."),
          t("Desfazer"),
          () => desfazer(alvo, res?.data),
        );
      },
    });
  }

  return {
    fechar: (alvo: Alvo) => executar("fechar", alvo),
    arquivar: (alvo: Alvo) => executar("arquivar", alvo),
    fechando: fechar.isPending,
    arquivando: arquivar.isPending,
  };
}
