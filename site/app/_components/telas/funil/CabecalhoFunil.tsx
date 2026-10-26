import type { ReactNode } from "react";

import { Icone } from "../../ui/Icones";
import { reais } from "./dados";

const VISTAS = ["kanban", "listBullets", "calendarBlank"] as const;
const DENSIDADES = [
  { compacto: false, icone: "rows", rotulo: "Confortável" },
  { compacto: true, icone: "listDashes", rotulo: "Compacto" },
] as const;

/**
 * Linha 1 da barra do Funil (CabecalhoDoFunil do CRM): título e resumo do recorte (abertos, soma e
 * "N atrasados", que é botão e liga o atalho de mesmo nome); à direita, vista, densidade e
 * "Novo Lead". O seletor de funil (`seletor`) fica ao lado do título.
 */
export function CabecalhoFunil({
  titulo,
  seletor,
  abertos,
  soma,
  atrasados,
  atrasadosLigado,
  onAtrasados,
  compacto,
  onCompacto,
}: {
  titulo: string;
  seletor: ReactNode;
  abertos: number;
  soma: number;
  atrasados: number;
  atrasadosLigado: boolean;
  onAtrasados: () => void;
  compacto: boolean;
  onCompacto: (c: boolean) => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="m-0 min-w-0 truncate text-title-lg">{titulo}</h3>
        {seletor}
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted" aria-live="polite">
          <span className="font-semibold text-text tabular-nums">{abertos === 1 ? "1 aberto" : `${abertos} abertos`}</span>
          {soma > 0 ? <span className="tabular-nums">{reais(soma)}</span> : null}
          {atrasados > 0 || atrasadosLigado ? (
            <button
              type="button"
              aria-pressed={atrasadosLigado}
              onClick={onAtrasados}
              className={`inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full px-2 font-semibold tabular-nums ${
                atrasadosLigado ? "bg-error-fg text-surface" : "bg-error-bg text-error-fg hover:brightness-95"
              }`}
            >
              <Icone nome="clock" peso="regular" className="size-3.5" />
              {atrasados === 1 ? "1 atrasado" : `${atrasados} atrasados`}
            </button>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div aria-hidden="true" className="hidden rounded-md border border-border p-0.5 md:flex">
          {VISTAS.map((n, i) => (
            <span
              key={n}
              className={`grid size-8 place-items-center rounded-sm ${i === 0 ? "bg-surface-elevated text-text" : "text-text-muted"}`}
            >
              <Icone nome={n} peso="regular" className="size-4" />
            </span>
          ))}
        </div>
        <div role="group" aria-label="Densidade dos cards" className="hidden rounded-md border border-border p-0.5 md:flex">
          {DENSIDADES.map((o) => (
            <button
              key={o.rotulo}
              type="button"
              aria-pressed={compacto === o.compacto}
              aria-label={o.rotulo}
              title={o.rotulo}
              onClick={() => onCompacto(o.compacto)}
              className={`grid size-8 cursor-pointer place-items-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                compacto === o.compacto ? "bg-surface-elevated text-text" : "text-text-muted hover:text-text"
              }`}
            >
              <Icone nome={o.icone} peso="regular" className="size-4" />
            </button>
          ))}
        </div>
        <span
          aria-hidden="true"
          className="hidden h-9 shrink-0 items-center justify-center gap-1.75 rounded-control bg-(image:--degrade) px-3.5 text-label font-semibold whitespace-nowrap text-white md:inline-flex"
        >
          <Icone nome="plus" peso="regular" className="size-4" /> Novo Lead
        </span>
      </div>
    </header>
  );
}
