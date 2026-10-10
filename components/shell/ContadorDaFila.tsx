"use client";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Quantas conversas esperam uma PESSOA — o número ao lado de "Inbox" no menu.
 *
 * É a aba Fila: conversa sem dono em que o automático saiu de campo — a IA
 * passou a conversa para a equipe (cliente irritado, pedido de atendente,
 * reclamação) ou alguém a devolveu à fila. Medido numa loja (26/09/2026): a IA
 * passou duas conversas numa manhã e o dono só soube abrindo o Inbox e
 * procurando; pediu para "ver as transferências no menu". Reusa a MESMA
 * contagem das abas do Inbox (sem filtros, a chave do React Query é a mesma).
 */
export function ContadorDaFila({ compacto }: { compacto: boolean }) {
  const t = useT();
  const { activeOrg } = useAuth();
  const { data } = useConversationCounts(activeOrg?.orgId ?? null);
  const esperando = data?.fila ?? data?.unassigned ?? 0;
  if (!esperando) return null;
  const rotulo =
    esperando === 1 ? t("1 conversa esperando uma pessoa") : `${esperando} ${t("conversas esperando uma pessoa")}`;
  // Visual v2: o número aparece TAMBÉM no trilho (o `.rail-badge` do
  // protótipo), não só um ponto: "3 esperando" decide se vale largar o que se
  // está fazendo, "tem algo" não. Cor da marca, com anel no fundo do trilho
  // para o selo recortar o botão; no item do menu, a pílula `.nav2-count`.
  return (
    <span
      data-testid="contador-da-fila"
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "pele-grad grid place-items-center rounded-full bg-accent font-bold leading-none text-accent-foreground tabular-nums",
        compacto
          ? "absolute top-1 right-2 h-[17px] min-w-[17px] px-1 text-[10.5px] ring-2 ring-background"
          : "ml-auto h-5 min-w-5 px-1.5 text-xs",
      )}
    >
      {esperando}
    </span>
  );
}
