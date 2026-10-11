"use client";

import type { ReactNode } from "react";

import type { IdDoMapa } from "@/lib/design-system/mapa";

import { RefDoPrototipo, SeloDoMapa } from "./SeloDoMapa";
import type { Tema } from "./tema";

/**
 * Uma seção da vitrine, com o título do quadro DS, a linha de apoio e, quando
 * há `mapa`, o selo de diferença e a referência ao arquivo:linha do quadro.
 * `sub` desenha o nível de baixo (os `<h3>` do quadro).
 */
export function Secao({
  id,
  titulo,
  apoio,
  mapa,
  tema,
  sub = false,
  children,
}: {
  id: string;
  titulo: string;
  apoio?: string;
  mapa?: IdDoMapa;
  tema?: Tema;
  sub?: boolean;
  children: ReactNode;
}) {
  const Titulo = sub ? "h3" : "h2";
  return (
    <section
      aria-labelledby={`ds-${id}`}
      className={
        sub
          ? "flex scroll-mt-24 flex-col gap-3 pt-2"
          : "flex scroll-mt-24 flex-col gap-4 border-t border-border pt-8 first:border-t-0 first:pt-0"
      }
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Titulo id={`ds-${id}`} className={sub ? "text-title-sm font-bold" : "text-title-lg font-bold tracking-tight"}>
            {titulo}
          </Titulo>
          {mapa && tema ? <SeloDoMapa id={mapa} tema={tema} /> : null}
          {mapa ? (
            <span className="ml-auto">
              <RefDoPrototipo id={mapa} tema={tema} />
            </span>
          ) : null}
        </div>
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
          <RefDoPrototipo id={mapa} tema={tema} />
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
