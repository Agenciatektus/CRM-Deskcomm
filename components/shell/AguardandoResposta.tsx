"use client";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useT } from "@/hooks/i18n/useT";

/**
 * "3 aguardando resposta", ao lado da trilha do cabeçalho (o `.crumb-note` do
 * protótipo), só na tela cujo destino tem o contador da fila (o Inbox).
 *
 * O número é a MESMA contagem do selo do menu e da aba Fila (sem filtros, a
 * chave do React Query é a mesma de `ContadorDaFila`): nenhum pedido novo, e
 * três lugares que não podem discordar entre si. Zero não desenha nada.
 */
export function AguardandoResposta() {
  const t = useT();
  const { activeOrg } = useAuth();
  const { data } = useConversationCounts(activeOrg?.orgId ?? null);
  const esperando = data?.fila ?? data?.unassigned ?? 0;
  if (!esperando) return null;
  return (
    <span className="shrink-0 pl-1 text-xs text-muted-foreground tabular-nums" data-testid="aguardando-resposta">
      {esperando} {t("aguardando resposta")}
    </span>
  );
}
