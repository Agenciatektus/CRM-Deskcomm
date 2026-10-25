"use client";

import { useEffect, useState } from "react";

import { CALCULADORA } from "@/lib/conteudo";
import type { Leitura } from "@/lib/conta";

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Texto de erro de um campo, a partir da leitura (ou de um erro específico da tela). */
export function textoDoErro(l: Leitura, extra?: string): string | null {
  if (extra) return extra;
  return l.estado === "erro" ? CALCULADORA.erros[l.motivo] : null;
}

/** Devolve `valor` só depois de ficar `ms` parado: o leitor de tela não anuncia a cada tecla. */
export function useAtrasado<T>(valor: T, ms = 700): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  max,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro: string | null;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.95rem] leading-snug font-semibold">
        {rotulo}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        maxLength={max ? String(max).length + 3 : 14}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={`min-h-11 w-full rounded-field border bg-bg px-3 text-[1rem] text-text ${
          erro ? "border-error-fg" : "border-border-strong"
        }`}
      />
      {erro ? (
        <p id={`${id}-erro`} className="m-0 text-meta font-semibold text-error-fg">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
