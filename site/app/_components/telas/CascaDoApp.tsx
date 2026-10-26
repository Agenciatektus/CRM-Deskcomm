import { Icone, type NomeIcone } from "../ui/Icones";

/**
 * Casca do app reutilizável pelas telas: trilho de 72 px (BarraEmDuasColunas) e barra do topo
 * (TopBar). Valores copiados do CRM: botão do trilho `min-h-14 w-16 rounded-xl` com rótulo de
 * 10,5 px; o grupo da rota vai em cartão (`pele-ativo-trilho`) com ícone cheio na cor da marca.
 */

const MENU: { icone: NomeIcone; rotulo: string }[] = [
  { icone: "chatsCircle", rotulo: "Atendimento" },
  { icone: "kanban", rotulo: "CRM" },
  { icone: "robot", rotulo: "IA" },
  { icone: "plugs", rotulo: "Canais" },
  { icone: "chartBar", rotulo: "Análise" },
];

export type ItemDoMenu = (typeof MENU)[number]["rotulo"];

const BOTAO_DO_TRILHO =
  "relative flex min-h-14 w-16 max-w-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[10.5px] leading-[1.1] font-semibold tracking-[-0.01em]";
const BOTAO_MARCADO = "pele-ativo-trilho bg-surface text-text ring-1 ring-border";
const BOTAO_SOLTO = "text-text-muted";

export function RailDoApp({ ativo }: { ativo: ItemDoMenu | "Ajustes" }) {
  return (
    <nav aria-hidden="true" className="hidden w-[72px] shrink-0 flex-col items-center bg-bg @md:flex">
      <div className="flex h-14 w-full items-center justify-center px-2">
        <span className="pele-grad-contador grid size-10 shrink-0 place-items-center rounded-[11px] text-label font-bold">
          SA
        </span>
      </div>
      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-hidden px-1 py-2">
        {MENU.map((m) => {
          const daRota = m.rotulo === ativo;
          return (
            <span key={m.rotulo} className={`${BOTAO_DO_TRILHO} ${daRota ? BOTAO_MARCADO : BOTAO_SOLTO}`}>
              <Icone nome={m.icone} peso={daRota ? "fill" : "regular"} className={`size-5 ${daRota ? "text-accent" : ""}`} />
              <span className="max-w-full truncate">{m.rotulo}</span>
            </span>
          );
        })}
      </div>
      <div className="flex w-full flex-col items-center gap-1 border-t border-border px-1 py-2">
        <span className={`${BOTAO_DO_TRILHO} ${ativo === "Ajustes" ? BOTAO_MARCADO : BOTAO_SOLTO}`}>
          <Icone nome="gear" peso="regular" className="size-5" />
          <span className="max-w-full truncate">Ajustes</span>
        </span>
      </div>
    </nav>
  );
}

/** Topo do app (TopBar): 56 px, sem borda; busca no meio (até 440 px), sino com contador e avatar à direita. */
export function BarraGlobalDoApp() {
  return (
    <div aria-hidden="true" className="hidden h-14 shrink-0 items-center justify-between gap-3 bg-bg px-3 md:flex">
      <div className="min-w-0 flex-1" />
      <div className="flex min-w-0 flex-[3] justify-center">
        <span className="flex h-9 w-full max-w-[440px] items-center gap-2 rounded-lg border border-border bg-surface pr-2 pl-3 text-sm text-text-subtle">
          <Icone nome="magnifyingGlass" peso="regular" className="size-[15px] shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">Buscar contato, conversa ou lead</span>
          <kbd className="shrink-0 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 font-sans text-[11px] text-text-muted">
            ⌘K
          </kbd>
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted">
          <Icone nome="bell" peso="regular" className="size-[18px]" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-fg px-1 text-[10px] leading-none font-semibold text-[#1e1311]">
            2
          </span>
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(image:--degrade) text-xs font-semibold text-white">
          CA
        </span>
      </div>
    </div>
  );
}
