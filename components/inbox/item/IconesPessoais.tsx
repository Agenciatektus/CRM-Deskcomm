"use client";

import { useT } from "@/hooks/i18n/useT";
import { estaSilenciada } from "@/lib/inbox/estado-por-atendente";
import { BellSlash, PushPin } from "@/lib/ui/icons";

/**
 * Os ícones do estado POR ATENDENTE na linha da lista (migration 9042): fixada
 * e silenciada, só para quem está logado. Sem estado, não desenha nada (a
 * linha fica como era).
 */
export function IconesPessoais({ pinned, mutedUntil }: { pinned?: boolean; mutedUntil?: string | null }) {
  const t = useT();
  const silenciada = estaSilenciada(mutedUntil);
  if (!pinned && !silenciada) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-text-subtle">
      {silenciada && (
        <BellSlash size={13} aria-label={t("Silenciada")} role="img" data-testid="icone-silenciada" />
      )}
      {pinned && (
        <PushPin size={13} weight="fill" aria-label={t("Fixada")} role="img" data-testid="icone-fixada" />
      )}
    </span>
  );
}
