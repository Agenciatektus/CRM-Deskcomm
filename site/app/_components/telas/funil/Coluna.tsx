"use client";

import { useState } from "react";

import { Cartao } from "./Cartao";
import { reais, somaEtapa, type Cartao as DadosDoCartao, type Etapa } from "./dados";

/**
 * Coluna do quadro (StageColumn): 320 px, cabeçalho grudado (caixa que seleciona a etapa no hover,
 * ponto da etapa, nome e contador), faixa própria com a soma e o valor ponderado, e os cartões.
 * Na vista de celular (`lista`) ocupa a largura toda e empilha.
 */
export function Coluna({ etapa, cartoes, lista = false }: { etapa: Etapa; cartoes: DadosDoCartao[]; lista?: boolean }) {
  const { soma, ponderado } = somaEtapa(etapa, cartoes);
  const [todos, setTodos] = useState(false);
  const marcado = todos && cartoes.length > 0;
  return (
    <section
      aria-label={`${etapa.nome}, ${cartoes.length} ${cartoes.length === 1 ? "lead" : "leads"}`}
      className={`flex flex-col self-start rounded-lg border border-border ${lista ? "w-full" : "w-80 shrink-0"}`}
    >
      <div className="sticky top-0 z-10 rounded-t-lg bg-bg">
        <div className="group/etapa flex items-center gap-2 border-b border-border px-3 py-2.5">
          <input
            type="checkbox"
            checked={marcado}
            disabled={cartoes.length === 0}
            onChange={(e) => setTodos(e.target.checked)}
            aria-label={`${marcado ? "Desmarcar" : "Selecionar"} todos em ${etapa.nome}`}
            className={`size-4 shrink-0 cursor-pointer accent-accent transition-opacity focus:opacity-100 disabled:cursor-default ${
              marcado ? "opacity-100" : "opacity-0 group-hover/etapa:opacity-100 pointer-coarse:opacity-100"
            }`}
          />
          <i aria-hidden="true" className="size-2 rounded-full" style={{ background: etapa.cor }} />
          <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-text">{etapa.nome}</h4>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
            {cartoes.length}
          </span>
        </div>
        {soma > 0 ? (
          <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-muted tabular-nums">
            {reais(soma)}
            {ponderado !== undefined ? <span className="ml-2">· ponderado {reais(ponderado)}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 p-2">
        {cartoes.length ? (
          cartoes.map((k) => <Cartao key={k.id} k={k} etapaMarcada={marcado} />)
        ) : (
          <div className="flex h-20 items-center justify-center text-[11px] text-text-muted">vazio</div>
        )}
      </div>
    </section>
  );
}
