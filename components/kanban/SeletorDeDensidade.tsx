"use client";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

const OPCOES = [
  { compacto: false, rotulo: "Confortável" },
  { compacto: true, rotulo: "Compacto" },
] as const;

/**
 * Confortável × compacto, no cabeçalho do Funil. Dois `<button>` nativos com
 * `aria-pressed`: é uma escolha entre dois estados, e o leitor de tela diz
 * qual está ligado sem precisar de componente próprio.
 */
export function SeletorDeDensidade({
  compacto,
  onChange,
}: {
  compacto: boolean;
  onChange: (compacto: boolean) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t("Densidade dos cards")} className="flex rounded-md border border-border p-0.5">
      {OPCOES.map((opcao) => (
        <button
          key={opcao.rotulo}
          type="button"
          aria-pressed={compacto === opcao.compacto}
          onClick={() => onChange(opcao.compacto)}
          className={cn(
            "h-8 rounded-sm px-3 text-sm transition-colors mb:min-h-11",
            compacto === opcao.compacto ? "bg-muted font-medium text-text" : "text-text-muted hover:text-text",
          )}
        >
          {t(opcao.rotulo)}
        </button>
      ))}
    </div>
  );
}
