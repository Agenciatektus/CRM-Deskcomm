"use client";

import type { ReactNode } from "react";

import type { IdDoMapa } from "@/lib/design-system/mapa";

import { RefDoPrototipo, SeloDoMapa } from "./SeloDoMapa";
import type { Tema } from "./tema";

/** Uma seção da vitrine: título, linha de apoio e o conteúdo. */
export function Secao({
  id,
  titulo,
  apoio,
  children,
}: {
  id: string;
  titulo: string;
  apoio?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`ds-${id}`} className="flex flex-col gap-4 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <header className="flex flex-col gap-1">
        <h2 id={`ds-${id}`} className="text-title-lg font-bold tracking-tight">
          {titulo}
        </h2>
        {apoio ? <p className="max-w-3xl text-ui text-text-muted">{apoio}</p> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Um exemplo: o nome do que se vê, o selo do mapa, a referência ao protótipo e
 * o componente de verdade embaixo.
 */
export function Exemplo({
  nome,
  mapa,
  tema,
  children,
}: {
  nome: string;
  mapa: IdDoMapa;
  tema: Tema;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label font-bold">{nome}</h3>
        <SeloDoMapa id={mapa} tema={tema} />
        <span className="ml-auto">
          <RefDoPrototipo id={mapa} />
        </span>
      </div>
      {children}
    </div>
  );
}

/** Uma linha de estados: rótulo pequeno em cima de cada variação. */
export function Estados({ itens }: { itens: { rotulo: string; no: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {itens.map((item) => (
        <div key={item.rotulo} className="flex flex-col items-start gap-1.5">
          <span className="text-meta text-text-subtle">{item.rotulo}</span>
          {item.no}
        </div>
      ))}
    </div>
  );
}
