"use client";

import { useState } from "react";

import { FAIXA_APOIO, FAIXA_CANAIS, FAIXA_INTEGRACOES, FAIXA_PAUSAR, FAIXA_ROTULO } from "@/lib/conteudo";

import { Container } from "./Secao";
import { Icone } from "./ui/Icones";
import * as L from "./ui/logos";

type Marca = (typeof FAIXA_CANAIS | typeof FAIXA_INTEGRACOES)[number]["marca"];

/** Logotipo: path (Simple Icons) e cor da marca, usada só no hover. Sem path, cai num ícone genérico. */
const MARCAS: Record<Marca, { d?: string; cor: string }> = {
  whatsapp: { d: L.WHATSAPP, cor: "group-hover:text-[#25D366]" },
  instagram: { d: L.INSTAGRAM, cor: "group-hover:text-[#E4405F]" },
  meta: { d: L.META, cor: "group-hover:text-[#0081FB]" },
  agenda: { d: L.GOOGLE_AGENDA, cor: "group-hover:text-[#4285F4]" },
  ads: { d: L.GOOGLE_ADS, cor: "group-hover:text-[#FBBC04]" },
  openrouter: { d: L.OPENROUTER, cor: "group-hover:text-[#94A3B8]" },
  anthropic: { d: L.ANTHROPIC, cor: "group-hover:text-[#D97757]" },
  ia: { cor: "group-hover:text-[#10A37F]" },
};

type Item = { nome: string; marca: Marca };

function Linha({ itens, classe }: { itens: readonly Item[]; classe: string }) {
  const dobro = [...itens, ...itens];
  return (
    <ul
      className={`${classe} m-0 flex w-max list-none items-center p-0 motion-reduce:w-auto motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-3 motion-reduce:px-5`}
    >
      {dobro.map((t, i) => {
        const m = MARCAS[t.marca];
        const copia = i >= itens.length;
        return (
          <li
            key={`${t.nome}-${i}`}
            aria-hidden={copia ? "true" : undefined}
            className={`group mr-3 inline-flex h-14 shrink-0 items-center gap-3 rounded-card border border-border bg-surface px-5 text-ui font-semibold text-text-muted transition-colors duration-150 ease-(--ease-rapida) hover:text-text motion-reduce:mr-0 ${copia ? "motion-reduce:hidden" : ""}`}
          >
            <span className={`text-text-subtle transition-colors duration-150 ease-(--ease-rapida) ${m.cor}`}>
              {m.d ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden="true" focusable="false">
                  <path d={m.d} />
                </svg>
              ) : (
                <Icone nome="cerebro" className="size-6" />
              )}
            </span>
            {t.nome}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Faixa de canais e integrações: duas linhas em sentidos opostos, logotipos monocromáticos que ganham a
 * cor da marca no hover. Pausa no hover, no foco e pelo botão (WCAG 2.2.2). Em prefers-reduced-motion
 * vira grade parada (o movimento só existe em `no-preference`, ver globals.css).
 */
export function Faixa() {
  const [pausada, setPausada] = useState(false);
  return (
    <section
      aria-labelledby="titulo-faixa"
      data-pausada={pausada}
      className="faixa relative overflow-x-clip py-(--espaco-secao-s)"
    >
      <Container largura="sangria">
        <div className="relative mb-8 flex items-center justify-center">
          <h2 id="titulo-faixa" className="m-0 text-lg font-semibold text-text">
            {FAIXA_ROTULO}
          </h2>
          <button
            type="button"
            aria-pressed={pausada}
            onClick={() => setPausada((p) => !p)}
            className="absolute right-0 inline-flex h-8 items-center gap-1.5 rounded-controle border border-border px-3 text-meta font-semibold text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:hidden"
          >
            <svg viewBox="0 0 256 256" fill="currentColor" className="size-4" aria-hidden="true" focusable="false">
              {pausada ? (
                <path d="M240 128a16 16 0 0 1-7.6 13.5L88.3 229.7A16 16 0 0 1 64 216.1V39.9a16 16 0 0 1 24.3-13.8l144.1 88.4A16 16 0 0 1 240 128Z" />
              ) : (
                <path d="M200 32h-40a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h40a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16Zm-88 0H72a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h40a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16Z" />
              )}
            </svg>
            {pausada ? FAIXA_PAUSAR.retomar : FAIXA_PAUSAR.pausar}
          </button>
        </div>
        <div
          aria-hidden="true"
          className="mb-6 h-px bg-linear-to-r from-transparent via-border to-transparent"
        />
        <div className="flex flex-col gap-3 overflow-x-clip [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)] motion-reduce:[mask-image:none]">
          <Linha itens={FAIXA_CANAIS} classe="a-corre" />
          <Linha itens={FAIXA_INTEGRACOES} classe="a-corre-inverso" />
        </div>
        <p className="mx-auto mt-6 mb-0 max-w-(--container-leitura) text-center text-[0.95rem] text-text-subtle">
          {FAIXA_APOIO}
        </p>
      </Container>
    </section>
  );
}
