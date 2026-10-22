"use client";

import { useT } from "@/hooks/i18n/useT";
import { CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * CABEÇALHO DE GRUPO RECOLHÍVEL — "Atrasadas 4", "Hoje 2", "Encerradas 12".
 *
 * Um botão de verdade dentro do `<h2>` (leitor de tela anuncia o título E o
 * estado), com `aria-expanded` apontando para a lista que ele esconde
 * (`aria-controls`). A contagem fica visível também recolhido: é ela que diz
 * se vale abrir.
 */
export function CabecalhoDeGrupo({
  idDaLista,
  titulo,
  contagem,
  aberto,
  onAlternar,
  alerta = false,
}: {
  idDaLista: string;
  titulo: string;
  contagem: number;
  aberto: boolean;
  onAlternar: () => void;
  /** Tom de erro (o grupo "Atrasadas"). */
  alerta?: boolean;
}) {
  const t = useT();
  return (
    <h2 className="m-0">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        onClick={onAlternar}
        title={aberto ? t("Recolher o grupo") : t("Expandir o grupo")}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold tracking-wide uppercase",
          "transition-colors duration-ui ease-emphasized hover:bg-hover",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent mb:min-h-11",
          alerta ? "text-error-fg" : "text-text-subtle",
        )}
      >
        <CaretRight
          size={12}
          aria-hidden
          className={cn("shrink-0 transition-transform duration-ui ease-emphasized", aberto && "rotate-90")}
        />
        <span>{titulo}</span>
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-meta tabular-nums normal-case",
            alerta ? "bg-error-bg text-error-fg" : "bg-surface-elevated text-text-muted",
          )}
        >
          {contagem}
        </span>
      </button>
    </h2>
  );
}
