"use client";

import { Archive, CheckCircle, Robot, Tray, UserCircle } from "@/lib/ui/icons";
import { EmptyInbox, EmptyState } from "@/components/empty";
import { useT } from "@/hooks/i18n/useT";
import type { InboxTab } from "./InboxFilters";

/**
 * O vazio por AUSÊNCIA, dito na língua da aba.
 *
 * "Quando chegarem mensagens, elas aparecem aqui" é verdade para a caixa
 * inteira, e mentira para a Fila vazia numa operação cheia de conversa: ali o
 * vazio é a BOA notícia (ninguém esperando), e o texto genérico fazia o
 * atendente achar que o canal tinha caído. Cada aba diz o que o vazio dela
 * significa e o que faz alguma coisa aparecer ali.
 *
 * Sem aba (quem renderiza a lista fora do Inbox, ou o teste antigo) e na aba
 * "Todas" continua o `EmptyInbox`: lá o texto genérico é o verdadeiro.
 */
export function VazioDaAba({ tab }: { tab?: InboxTab }) {
  const t = useT();
  switch (tab) {
    case "unassigned":
      return (
        <EmptyState
          icon={Tray}
          headline={t("Fila vazia")}
          subcopy={t("Ninguém esperando atendimento agora. Quem precisar de uma pessoa aparece aqui.")}
        />
      );
    case "mine":
      return (
        <EmptyState
          icon={UserCircle}
          headline={t("Nenhuma conversa com você")}
          subcopy={t("As conversas que você assumir aparecem aqui. Veja a Fila para pegar a próxima.")}
        />
      );
    case "ai":
      return (
        <EmptyState
          icon={Robot}
          headline={t("Nada com o automático agora")}
          subcopy={t("Conversas que o atendimento automático está conduzindo aparecem aqui.")}
        />
      );
    case "closed":
      return (
        <EmptyState
          icon={CheckCircle}
          headline={t("Nenhuma conversa fechada")}
          subcopy={t("Atendimentos encerrados ficam guardados aqui.")}
        />
      );
    case "archived":
      return (
        <EmptyState
          icon={Archive}
          headline={t("Nada arquivado")}
          subcopy={t("Conversas arquivadas saem da fila de trabalho e ficam aqui, sem serem apagadas.")}
        />
      );
    default:
      return <EmptyInbox />;
  }
}
