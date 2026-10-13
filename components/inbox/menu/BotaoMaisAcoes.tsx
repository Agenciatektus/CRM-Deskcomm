"use client";

import { useT } from "@/hooks/i18n/useT";
import { DotsThree } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O "…" da linha da conversa (`conv-more` do protótipo).
 *
 * Fica por cima do canto da hora e só aparece no hover da linha, no foco (dele
 * ou da linha) e enquanto o menu está aberto. Em tela de toque, que não tem
 * hover, fica sempre visível: senão o menu só abriria pelo toque longo.
 */
export function BotaoMaisAcoes({ nome, aberto, onAbrir }: {
  nome: string;
  aberto: boolean;
  onAbrir: (el: HTMLButtonElement) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={`${t("Ações da conversa com")} ${nome}`}
      aria-haspopup="menu"
      aria-expanded={aberto}
      title={t("Mais ações")}
      data-testid="mais-acoes-da-conversa"
      onClick={(e) => onAbrir(e.currentTarget)}
      className={cn(
        "absolute right-2.5 top-2 grid size-[30px] place-items-center rounded-lg border border-border bg-surface text-text-muted shadow-xs transition-opacity hover:border-border-strong hover:text-text",
        "opacity-0 focus-visible:opacity-100 group-hover/linha:opacity-100 group-focus-within/linha:opacity-100 [@media(hover:none)]:opacity-100",
        aberto && "opacity-100",
      )}
    >
      <DotsThree size={16} weight="bold" aria-hidden />
    </button>
  );
}
