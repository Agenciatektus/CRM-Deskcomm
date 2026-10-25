"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

import { CALCULADORA } from "@/lib/conteudo";

import { AbaTime } from "./calculadora/AbaTime";
import { AbaVacuo } from "./calculadora/AbaVacuo";

const ABAS = [
  { id: "vacuo", rotulo: CALCULADORA.abaVacuo },
  { id: "time", rotulo: CALCULADORA.abaTime },
] as const;

/**
 * Calculadora da LP em duas abas sublinhadas (tablist com setas, Home e End). Tudo roda no
 * navegador e nenhum campo vem preenchido. As contas ficam em `lib/conta.ts`.
 */
export function Calculadora() {
  const base = useId();
  const [ativa, setAtiva] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const vai = (i: number) => {
    const n = (i + ABAS.length) % ABAS.length;
    setAtiva(n);
    refs.current[n]?.focus();
  };
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") vai(ativa + 1);
    else if (e.key === "ArrowLeft") vai(ativa - 1);
    else if (e.key === "Home") vai(0);
    else if (e.key === "End") vai(ABAS.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="card p-5 sm:p-8 lg:p-10">
      <div
        role="tablist"
        aria-label="Contas da calculadora"
        onKeyDown={aoTeclar}
        className="mb-8 flex flex-wrap gap-x-8 border-b border-border"
      >
        {ABAS.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-aba-${a.id}`}
            type="button"
            role="tab"
            aria-selected={ativa === i}
            aria-controls={`${base}-painel-${a.id}`}
            tabIndex={ativa === i ? 0 : -1}
            onClick={() => setAtiva(i)}
            className={`-mb-px min-h-11 cursor-pointer border-b-2 pb-3 text-[1rem] font-semibold transition-colors ${
              ativa === i ? "border-accent-text text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {ABAS.map((a, i) => (
        <div
          key={a.id}
          id={`${base}-painel-${a.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-aba-${a.id}`}
          hidden={ativa !== i}
        >
          {a.id === "vacuo" ? <AbaVacuo /> : <AbaTime />}
        </div>
      ))}
    </div>
  );
}
