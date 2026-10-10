"use client";

import { useAgentInbox } from "@/hooks/ai/useAgentInbox";
import { useT } from "@/hooks/i18n/useT";

/**
 * Quantos avisos estão em aberto: o número ao lado de "Alertas" na coluna 2
 * (S15 da auditoria). A MESMA leitura do sino (`useAgentInbox("open")`, mesma
 * chave do React Query), então sino e menu nunca discordam e não há pedido a
 * mais. Sem a permissão `ai.inbox.view` a consulta nem roda e nada aparece.
 * Tom de alerta suave (o `.nav2-count.soft` do protótipo): é pendência, não
 * marca. Zero não desenha nada.
 */
export function ContadorDeAvisos() {
  const t = useT();
  const { data } = useAgentInbox("open");
  const abertos = data?.open_count ?? 0;
  if (!abertos) return null;
  const rotulo = abertos === 1 ? t("1 aviso em aberto") : `${abertos} ${t("avisos em aberto")}`;
  return (
    <span
      data-testid="contador-de-avisos"
      aria-label={rotulo}
      title={rotulo}
      className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-error-bg px-1.5 text-xs font-bold leading-none text-error-fg tabular-nums"
    >
      {abertos}
    </span>
  );
}
