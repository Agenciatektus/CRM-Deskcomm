import type { ReactNode } from "react";

import { Icone, type NomeIcone } from "../ui/Icones";

/**
 * Casca do app reutilizável pelas telas de exemplo: trilho de navegação (RailDoApp) e topo da página
 * (TopoDoApp). Mesmos valores do CRM: trilho de 72 px, rótulo de 10,5 px, item ativo em cartão.
 */

const MENU: { icone: NomeIcone; rotulo: string }[] = [
  { icone: "inbox", rotulo: "Atendimento" },
  { icone: "funil", rotulo: "CRM" },
  { icone: "agente", rotulo: "Agentes" },
  { icone: "conexao", rotulo: "Canais" },
  { icone: "grafico", rotulo: "Análise" },
];

export type ItemDoMenu = (typeof MENU)[number]["rotulo"];

export function RailDoApp({ ativo }: { ativo: ItemDoMenu }) {
  return (
    <nav
      aria-hidden="true"
      className="hidden w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-bg py-2.5 @md:flex"
    >
      <span className="mb-1.5 grid size-10 place-items-center rounded-xl bg-[#0e6d52] text-[13px] font-bold text-white">
        SA
      </span>
      {MENU.map((m) => (
        <span
          key={m.rotulo}
          className={`flex w-[62px] flex-col items-center gap-[3px] rounded-lg py-1.5 ${
            m.rotulo === ativo ? "pele-ativo-trilho text-text" : "text-text-muted"
          }`}
        >
          <Icone nome={m.icone} className="size-5" />
          <span className="text-rail font-semibold tracking-[-0.01em]">{m.rotulo}</span>
        </span>
      ))}
      <span className="mt-auto flex flex-col items-center gap-[3px] text-text-muted">
        <Icone nome="filtro" className="size-5" />
        <span className="text-rail font-semibold">Ajustes</span>
      </span>
    </nav>
  );
}

/** Topo da página dentro do app: título à esquerda, ações à direita. */
export function TopoDoApp({ titulo, children }: { titulo: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-4 py-3">
      <h3 className="m-0 min-w-0 text-xl font-bold tracking-[-0.01em]">{titulo}</h3>
      {children}
    </header>
  );
}

/** Barra global do app: busca (decorativa) com atalho, sino com contador e avatar. */
export function BarraGlobalDoApp() {
  return (
    <div
      aria-hidden="true"
      className="hidden h-[52px] shrink-0 items-center gap-3 border-b border-border bg-bg px-4 md:flex"
    >
      <span className="flex h-9 w-72 items-center gap-2 rounded-field bg-surface-elevated px-3 text-[13px] text-text-subtle">
        <Icone nome="busca" className="size-4" />
        <span className="flex-1">Buscar...</span>
        <kbd className="rounded-controle border border-border-strong px-1.5 font-sans text-meta text-text-muted">⌘K</kbd>
      </span>
      <span className="relative ml-auto text-text-muted">
        <Icone nome="sino" className="size-5" />
        <span className="pele-grad-contador absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold">
          2
        </span>
      </span>
      <span className="grid size-8 place-items-center rounded-full bg-surface-elevated text-meta font-bold text-text-muted">CA</span>
    </div>
  );
}
