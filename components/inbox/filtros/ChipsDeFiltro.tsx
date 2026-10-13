"use client";

import { X } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

export interface ChipDeFiltro {
  /** Chave estável para a lista e para o teste. */
  id: string;
  /** O texto já traduzido. */
  rotulo: string;
  onRemover: () => void;
}

/**
 * O que está ligado no popover de filtros, à vista e removível.
 *
 * Com os filtros atrás de um botão, o risco é o de sempre desta tela: a lista
 * num subconjunto e nada visível dizendo por quê. Os chips são a resposta. Cada
 * um desliga só o seu filtro, e "Limpar" desliga todos os do popover. A busca e
 * a aba ficam de fora: a busca já está escrita no campo logo acima, e a aba é o
 * lugar onde a pessoa está, não um filtro a esquecer.
 */
export function ChipsDeFiltro({ chips, onLimpar }: { chips: ChipDeFiltro[]; onLimpar: () => void }) {
  const t = useT();
  if (chips.length === 0) return null;
  return (
    <div role="group" className="flex flex-wrap items-center gap-1.5" aria-label={t("Filtros ativos")}>
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-filtro={chip.id}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1 text-xs font-semibold text-accent"
        >
          <span className="truncate">{chip.rotulo}</span>
          <button
            type="button"
            onClick={chip.onRemover}
            aria-label={`${t("Remover filtro")} ${chip.rotulo}`}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-accent/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onLimpar}
        className="h-6 rounded-md px-1.5 text-xs font-medium text-text-muted hover:text-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("Limpar")}
      </button>
    </div>
  );
}
