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

/** Largura de conteúdo por tipo de seção (tokens `--container-*` em globals.css). */
const LARGURA = {
  leitura: "max-w-(--container-leitura)",
  texto: "max-w-(--container-texto)",
  grade: "max-w-(--container-grade)",
  tela: "max-w-(--container-tela)",
  sangria: "max-w-(--container-sangria)",
} as const;

export type Largura = keyof typeof LARGURA;

/** Respiro vertical em três degraus: 64/80/96 no mobile e os tokens `--espaco-secao-*` a partir de md. */
const RITMO = {
  s: "py-12 md:py-(--espaco-secao-s)",
  m: "py-16 md:py-(--espaco-secao-m)",
  l: "py-20 md:py-(--espaco-secao-l)",
} as const;

export type Ritmo = keyof typeof RITMO;

/** Wrapper de largura e gutters (20, 32, 48, 64 e 80px conforme o viewport). */
export function Container({
  largura = "grade",
  className = "",
  children,
}: {
  largura?: Largura;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full px-5 sm:px-8 xl:px-12 2xl:px-16 min-[1920px]:px-20 ${LARGURA[largura]} ${className}`}>
      {children}
    </div>
  );
}

export function Secao({
  id,
  titulo,
  fundo = "nenhum",
  largura = "grade",
  ritmo = "m",
  fundoExtra,
  children,
}: {
  id?: string;
  /** Id do `h2` da seção, para o `aria-labelledby`. */
  titulo: string;
  fundo?: Fundo;
  largura?: Largura;
  ritmo?: Ritmo;
  /** Camadas extras de fundo (ex.: `ImagemDeSlot`), sob a mesma máscara vertical dos fundos. */
  fundoExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={titulo} className="relative isolate scroll-mt-16 overflow-x-clip">
      <div aria-hidden="true" className="fundo-mascarado pointer-events-none absolute inset-0 -z-10">
        {FUNDOS[fundo].map((c) => (
          <div key={c} className={`absolute inset-0 ${c}`} />
        ))}
        {fundoExtra}
      </div>
      <Container largura={largura} className={RITMO[ritmo]}>
        {children}
      </Container>
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
    <header className={`revela mb-12 max-w-(--container-leitura) lg:mb-16 ${centro ? "mx-auto text-center" : ""}`}>
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
