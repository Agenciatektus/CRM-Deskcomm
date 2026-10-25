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
export function TopoDoApp({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-4 py-3">
      <h3 className="m-0 min-w-0 flex-1 truncate text-xl font-bold tracking-[-0.01em]">{titulo}</h3>
      {children}
    </header>
  );
}
