import type { ReactNode } from "react";

/**
 * O título grande do começo de cada aba (o `.lt` do protótipo): 32px, 56px de altura,
 * ações à direita. Só no celular: quem decide isso é a casca (`CabecalhoDoCelular`).
 * `data-cabecalho-do-celular` faz a casca descontar a altura dele (`--mb-casca-topo`).
 */
export function CabecalhoGrande({ titulo, acoes }: { titulo: string; acoes?: ReactNode }) {
  return (
    <header
      data-cabecalho-do-celular=""
      className="sticky top-0 z-20 flex h-(--mb-titulo-altura) items-center justify-between gap-2 bg-background/95 pr-1.5 pl-4 backdrop-blur"
    >
      <h1 className="min-w-0 truncate text-(length:--mb-titulo-fonte) leading-[1.1] font-bold tracking-[-0.015em] text-text">
        {titulo}
      </h1>
      {acoes && <div className="flex shrink-0 items-center">{acoes}</div>}
    </header>
  );
}
