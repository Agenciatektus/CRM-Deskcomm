import type { ReactNode } from "react";

/**
 * Casca de toda seção da LP: fundo em camadas (só luz e textura, sem área chapada de degradê),
 * largura e respiro padrão, e o cabeçalho (título + texto) com revelação ao rolar.
 */
const FUNDOS = {
  nenhum: [],
  grade: ["fundo-grade", "fundo-brilho-azul"],
  pontos: ["fundo-pontos", "fundo-brilho-centro"],
  azul: ["fundo-brilho-azul", "fundo-ruido"],
  menta: ["fundo-brilho-menta", "fundo-ruido"],
  faixa: ["fundo-faixa", "fundo-pontos"],
} as const;

export type Fundo = keyof typeof FUNDOS;

export function Secao({
  id,
  titulo,
  fundo = "nenhum",
  larga = false,
  children,
}: {
  id?: string;
  /** Id do `h2` da seção, para o `aria-labelledby`. */
  titulo: string;
  fundo?: Fundo;
  larga?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={titulo} className="relative isolate scroll-mt-16 overflow-hidden">
      {FUNDOS[fundo].map((c) => (
        <div key={c} aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 ${c}`} />
      ))}
      <div className={`mx-auto px-5 py-24 lg:py-32 ${larga ? "max-w-[78rem]" : "max-w-6xl"}`}>{children}</div>
    </section>
  );
}

export function Cabeca({
  id,
  titulo,
  texto,
  centro = false,
}: {
  id: string;
  titulo: string;
  texto?: string;
  centro?: boolean;
}) {
  return (
    <header className={`revela mb-14 max-w-[44rem] lg:mb-20 ${centro ? "mx-auto text-center" : ""}`}>
      <h2
        id={id}
        className="m-0 text-[clamp(1.85rem,3.4vw,2.9rem)] leading-[1.1] font-bold tracking-tight text-balance"
      >
        {titulo}
      </h2>
      {texto ? <p className="mt-4 mb-0 text-[1.05rem] leading-relaxed text-text-muted">{texto}</p> : null}
    </header>
  );
}

/** Card de seção: superfície do CRM com fio de luz, sobe no hover. */
export function Card({
  children,
  className = "",
  atraso = 0,
}: {
  children: ReactNode;
  className?: string;
  atraso?: number;
}) {
  return (
    <div
      className={`card revela min-w-0 p-6 sm:p-8 ${className}`}
      style={{ "--atraso": `${atraso}s` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
