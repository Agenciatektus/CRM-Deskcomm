"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { isNotFound, useConversation } from "@/hooks/inbox/useConversation";
import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";
import { OpenConversationProvider } from "@/hooks/notifications/OpenConversationContext";
import { PainelDaConversa } from "@/components/inbox/PainelDaConversa";
import { ArrowSquareOut, ChatCircle } from "@/lib/ui/icons";

/**
 * A coluna de conversa do dossiê do negócio.
 *
 * ─── De onde vem a conversa ─────────────────────────────────────────────────
 *
 * O id é o `lead.conversa` que o board JÁ traz (a conversa mais recente do
 * contato). O objeto completo sai de `GET /api/v1/conversations/:id` — a mesma
 * busca única, RLS-scoped, que o deep-link do Inbox usa. A RLS é quem decide o
 * acesso: conversa que o usuário não enxerga vira o estado "fora do seu
 * acesso", nunca um vazamento nem um stack trace.
 *
 * ─── "Vista" é diferente de "montada" ───────────────────────────────────────
 *
 * No celular a coluna pode estar montada e escondida atrás da aba Detalhes.
 * Marcar como lida nesse estado zeraria o contador de não-lidas do atendente
 * sem ninguém ter lido — por isso `visivel` vem de quem sabe a aba e a largura,
 * e só ele libera o `mark-read` e a supressão de notificação.
 *
 * E aqui o `mark-read` só vale para quem é o DONO da conversa. O Kanban é tela
 * de revisão: um gestor passando pelos cards não leu nada pelo atendente, e o
 * `unread_count_for_assignee` é o contador DELE.
 *
 * ─── A conversa não tem realtime próprio aqui ───────────────────────────────
 *
 * No Inbox o objeto vem da lista com assinatura; aqui vem da busca única, que
 * ninguém atualiza. Sem isto, o cliente escreve, a mensagem aparece no thread
 * (que tem realtime), e o composer continua travado com "a janela fechou" —
 * `last_inbound_at` velho. `atividadeNoBoard` é o `last_message_at` que o
 * quadro (este sim ao vivo) recebe: quando ele muda, a conversa é relida.
 */
export function ConversaDoNegocio({
  conversationId,
  visivel,
  atividadeNoBoard,
}: {
  conversationId: string;
  visivel: boolean;
  atividadeNoBoard: string | null;
}) {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const conversa = useConversation(conversationId, true);
  const conversation = conversa.data ?? null;

  useEffect(() => {
    if (atividadeNoBoard === null) return;
    void qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
  }, [atividadeNoBoard, conversationId, qc]);

  const souODono = conversation?.assigned_to_user_id === user.id;
  useMarkAsRead(
    visivel && souODono ? (conversation?.id ?? null) : null,
    conversation?.unread_count_for_assignee ?? 0,
  );

  if (!conversation) {
    const foraDoAcesso = !conversa.isPending && isNotFound(conversa.error);
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
        aria-busy={conversa.isPending}
      >
        <ChatCircle size={32} weight="thin" className="text-text-subtle" aria-hidden />
        <p className="text-sm text-text-muted">
          {conversa.isPending
            ? t("Carregando a conversa…")
            : foraDoAcesso
              ? t("Conversa não encontrada ou fora do seu acesso.")
              : t("Não foi possível carregar a conversa.")}
        </p>
      </div>
    );
  }

  const numero = conversation.channel_sessions?.phone_number ?? null;
  const canal = conversation.channel_sessions?.display_name ?? numero;

  return (
    <OpenConversationProvider conversationId={visivel ? conversation.id : null}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border pb-2 pr-8">
          <ChatCircle size={16} weight="regular" className="shrink-0 text-text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">
              {conversation.contacts?.name ?? t("Conversa")}
            </p>
            {canal && (
              // Por QUAL número a resposta sai. Com mais de um número na
              // organização, é a informação que evita responder pelo chip errado.
              <p className="truncate text-xs text-text-muted">
                {t("Pelo número")} {canal}
              </p>
            )}
          </div>
          <Link
            href={`/app/inbox?id=${conversation.id}`}
            className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-text-muted transition-colors hover:bg-muted hover:text-text"
            title={t("Abrir esta conversa no Inbox")}
          >
            {t("Abrir no Inbox")}
            <ArrowSquareOut size={14} aria-hidden />
          </Link>
        </div>
        <PainelDaConversa
          key={conversation.id}
          conversation={conversation}
          onde="dossie"
        />
      </div>
    </OpenConversationProvider>
  );
}
