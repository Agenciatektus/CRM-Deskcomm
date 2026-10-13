"use client";
import type { ReactNode } from "react";

import { LinhaDeslizante, type AcaoDoGesto } from "@/components/mobile/LinhaDeslizante";
import { useAuth, usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useEncerrarComDesfazer } from "@/hooks/inbox/useEncerrarComDesfazer";
import { useEstadoDaConversa } from "@/hooks/inbox/useEstadoDaConversa";
import { regrasDoMenu } from "@/lib/inbox/menu-da-conversa";
import { Archive, DotsThree, EnvelopeOpen, EnvelopeSimple, PushPin, PushPinSlash } from "@/lib/ui/icons";

/**
 * O gesto de deslizar na linha da conversa, no celular (o item 01 do protótipo):
 * direita mostra Lida e Fixar; esquerda, Mais e Arquivar. As ações são as MESMAS do
 * menu da conversa, com as mesmas regras e o mesmo "Desfazer":
 * - Lida/Não lida e Fixar: `useEstadoDaConversa` (o toast com Desfazer do menu);
 *   suporte somente leitura não tem (como no menu, `podePreferir`).
 * - Arquivar: `useEncerrarComDesfazer`, só onde o menu oferece (`regrasDoMenu`).
 * - Mais: abre o menu da conversa, que no celular é folha.
 */
export function GestoDaConversa({
  conversation,
  automaticoDaOrg,
  meuUserId,
  aoAbrirMenu,
  children,
}: {
  conversation: ConversationWithContact;
  automaticoDaOrg?: boolean;
  meuUserId: string | null;
  aoAbrirMenu: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const { user } = useAuth();
  const podeEscrever = usePermission("inbox.claim");
  const estado = useEstadoDaConversa(t);
  const encerrar = useEncerrarComDesfazer();
  const suporteSoLeitura = user.support?.access_mode === "support_readonly";
  const regras = regrasDoMenu({ conversation, meuUserId, leitura: suporteSoLeitura || !podeEscrever, automaticoDaOrg });
  const id = conversation.id;

  const esquerda: AcaoDoGesto[] = suporteSoLeitura
    ? []
    : [
        conversation.marked_unread
          ? { id: "lida", rotulo: t("Lida"), icone: EnvelopeOpen, fundo: "bg-mb-gesto-lida", aoTocar: () => estado.mutate({ conversationId: id, acao: { tipo: "desmarcar_nao_lida" } }) }
          : { id: "lida", rotulo: t("Não lida"), icone: EnvelopeSimple, fundo: "bg-mb-gesto-lida", aoTocar: () => estado.mutate({ conversationId: id, acao: { tipo: "marcar_nao_lida" } }) },
        {
          id: "fixar",
          rotulo: conversation.pinned ? t("Desafixar") : t("Fixar"),
          icone: conversation.pinned ? PushPinSlash : PushPin,
          fundo: "bg-mb-gesto-neutro",
          aoTocar: () => estado.mutate({ conversationId: id, acao: { tipo: conversation.pinned ? "desafixar" : "fixar" } }),
        },
      ];
  const direita: AcaoDoGesto[] = [
    { id: "mais", rotulo: t("Mais"), icone: DotsThree, fundo: "bg-mb-gesto-neutro", aoTocar: aoAbrirMenu },
    ...(regras.arquivar
      ? [{ id: "arquivar", rotulo: t("Arquivar"), icone: Archive, fundo: "bg-mb-gesto-arquivar", aoTocar: () => encerrar.arquivar(conversation) }]
      : []),
  ];

  return (
    <LinhaDeslizante esquerda={esquerda} direita={direita}>
      {children}
    </LinhaDeslizante>
  );
}
