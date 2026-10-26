import { Icone, type NomeIcone } from "../../ui/Icones";
import { CHIPS, contagem, type Chip, type Funil } from "./dados";

const ICONE_DO_CHIP: Record<Chip, NomeIcone> = {
  meus: "userCircle",
  atrasados: "clock",
  semPasso: "plus",
  parados: "flag",
};

/**
 * Linha 2 da barra do Funil (BarraDeBusca do CRM): busca, atalhos de um toque com contagem,
 * "Filtros" e "Ordenar". Chip desligado é contorno; ligado (`aria-pressed`) é o degradê da ação.
 */
export function BarraFunil({
  funil,
  busca,
  onBusca,
  ativos,
  onAlterna,
}: {
  funil: Funil;
  busca: string;
  onBusca: (v: string) => void;
  ativos: ReadonlySet<Chip>;
  onAlterna: (c: Chip) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Buscar leads</span>
          <Icone
            nome="magnifyingGlass"
            peso="regular"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-subtle"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar por nome ou etiqueta"
            className="h-9 w-full rounded-md border border-border bg-surface-elevated pr-3 pl-8 text-sm text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {CHIPS.map((c) => {
            const on = ativos.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => onAlterna(c.id)}
                className={`inline-flex h-7.5 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2.75 text-label font-semibold whitespace-nowrap transition-[background-color,border-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  on
                    ? "border-transparent bg-(image:--degrade) text-white"
                    : "border-border-strong bg-surface text-text-muted hover:border-text-subtle hover:text-text"
                }`}
              >
                <Icone nome={ICONE_DO_CHIP[c.id]} peso="regular" className="size-3.5 shrink-0" />
                {c.rotulo}
                {c.id !== "meus" ? <span className="tabular-nums opacity-70">{contagem(funil, c.id)}</span> : null}
              </button>
            );
          })}
        </div>
        <div aria-hidden="true" className="ml-auto flex items-center gap-2">
          <span className="inline-flex h-7.5 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-label font-semibold text-text">
            <Icone nome="slidersHorizontal" peso="regular" className="size-4" />
            Filtros
          </span>
          <span className="inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 text-label font-semibold text-text">
            <Icone nome="arrowsDownUp" peso="regular" className="size-4" />
            <span className="text-text-muted">Ordenar:</span>
            <span className="max-w-48 truncate">Mais recentes</span>
            <Icone nome="caretDown" peso="regular" className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
