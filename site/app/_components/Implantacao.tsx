import { IMPLANTACAO } from "@/lib/conteudo";

import { Cabeca, Secao } from "./Secao";
import { Icone } from "./ui/Icones";

/**
 * Implantação opcional: linha do tempo com a ORDEM dos passos (sem prazo por etapa), a barra dos 30 dias
 * de acompanhamento, os dois lados (o que a Tektus faz e o que o cliente entrega) e os entregáveis.
 * O prazo geral só aparece quando `IMPLANTACAO.prazoGeral` for preenchido.
 */
export function Implantacao() {
  const ultimo = IMPLANTACAO.linha.length - 1;
  return (
    <Secao id="implantacao" titulo="titulo-implantacao" fundo="azul" largura="grade" ritmo="l">
      <Cabeca id="titulo-implantacao" titulo={IMPLANTACAO.titulo} texto={IMPLANTACAO.texto} />
      {IMPLANTACAO.prazoGeral ? (
        <p className="mt-0 mb-8 text-base font-semibold">
          {IMPLANTACAO.rotuloPrazo}: {IMPLANTACAO.prazoGeral}
        </p>
      ) : null}

      <ol className="relative m-0 grid list-none gap-8 p-0 lg:grid-cols-5 lg:gap-6 [&>*]:min-w-0">
        <span
          aria-hidden="true"
          className="absolute top-5 right-[10%] left-[10%] hidden h-0.5 bg-border-strong lg:block"
        />
        <span
          aria-hidden="true"
          className="absolute top-5 right-[10%] hidden h-0.5 w-[20%] bg-(image:--degrade) lg:block"
        />
        <span aria-hidden="true" className="absolute top-5 bottom-5 left-5 w-0.5 bg-border-strong lg:hidden" />
        {IMPLANTACAO.linha.map((p, i) => (
          <li
            key={p.titulo}
            className="revela relative grid grid-cols-[auto_1fr] items-start gap-4 lg:block"
            style={{ "--atraso": `${i * 0.06}s` } as React.CSSProperties}
          >
            <span
              className={`relative z-10 grid size-10 place-items-center rounded-full border bg-surface-elevated text-link lg:mx-auto ${
                i === ultimo ? "border-accent" : "border-border-strong"
              }`}
            >
              <Icone nome={p.icone} className="size-5" />
            </span>
            <div className="lg:mt-4 lg:text-center">
              <h3 className="m-0 text-base leading-snug font-bold">{p.titulo}</h3>
              <p className="mt-1 mb-0 text-ui leading-relaxed text-text-muted">{p.texto}</p>
              {i === ultimo ? (
                <div className="mt-3">
                  <div className="relative h-2 overflow-hidden rounded-full bg-border">
                    <div className="a-enche absolute inset-0 rounded-full bg-(image:--degrade)" />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[repeating-linear-gradient(to_right,transparent_0_calc(3.3333%-1px),rgb(13_14_17/0.7)_calc(3.3333%-1px)_3.3333%)]"
                    />
                  </div>
                  <p className="m-0 mt-2 text-meta text-text-subtle">{IMPLANTACAO.acompanhamento}</p>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
        <div className="card revela p-6 sm:p-8">
          <h3 className="m-0 mb-4 text-[1.15rem] font-bold">{IMPLANTACAO.tektusFazTitulo}</h3>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {IMPLANTACAO.tektusFaz.map((t) => (
              <li key={t} className="flex gap-2.5 leading-snug">
                <Icone nome="check" className="mt-0.5 size-5 shrink-0 text-ok" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="revela rounded-grande border border-dashed border-border-strong p-6 sm:p-8">
          <h3 className="m-0 mb-4 text-[1.15rem] font-bold">{IMPLANTACAO.voceEntregaTitulo}</h3>
          <ul className="m-0 grid list-none gap-3 p-0">
            {IMPLANTACAO.voceEntrega.map((t) => (
              <li key={t} className="flex gap-2.5 leading-snug text-text-muted">
                <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded-full border-2 border-text-subtle" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="revela mt-8">
        <h3 className="m-0 mb-3 text-base font-bold">{IMPLANTACAO.entregaveisTitulo}</h3>
        <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
          {IMPLANTACAO.entregaveis.map((e) => (
            <li
              key={e.texto}
              className="inline-flex h-12 items-center gap-2.5 rounded-card border border-border bg-surface px-4 text-[0.95rem] font-semibold"
            >
              <Icone nome={e.icone} className="size-5 text-link" />
              {e.texto}
            </li>
          ))}
        </ul>
        <a
          href="#oferta"
          className="mt-6 inline-block rounded-controle font-semibold text-link underline underline-offset-4 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {IMPLANTACAO.cta}
        </a>
      </div>
    </Secao>
  );
}
