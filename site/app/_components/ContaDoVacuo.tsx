"use client";

import { useId, useState } from "react";

import { CONTA } from "@/lib/conteudo";

/**
 * A conta do vácuo: conversas x fatia sem resposta x ticket. Roda só no navegador, sem envio de
 * dados e sem valor pré-preenchido. O resultado fica numa região `aria-live` para o leitor de tela.
 */
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function numero(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  max,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.95rem] leading-snug font-semibold">
        {rotulo}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step="any"
        autoComplete="off"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="min-h-11 w-full rounded-field border border-border-strong bg-bg px-3 text-[1rem] text-text"
      />
    </div>
  );
}

export function ContaDoVacuo() {
  const base = useId();
  const [conversas, setConversas] = useState("");
  const [fatia, setFatia] = useState("");
  const [ticket, setTicket] = useState("");

  const c = numero(conversas);
  const f = numero(fatia);
  const t = numero(ticket);
  const pronto = c !== null && f !== null && t !== null && f <= 100;
  const total = pronto ? c * (f / 100) * t : null;

  return (
    <div className="card p-5 sm:p-8">
      <div className="grid gap-5 md:grid-cols-3 md:items-end">
        <Campo id={`${base}-c`} rotulo={CONTA.campo1} valor={conversas} aoMudar={setConversas} />
        <Campo id={`${base}-f`} rotulo={CONTA.campo2} valor={fatia} aoMudar={setFatia} max={100} />
        <Campo id={`${base}-t`} rotulo={CONTA.campo3} valor={ticket} aoMudar={setTicket} />
      </div>
      <div
        aria-live="polite"
        className="mt-6 rounded-field border border-border-strong bg-bg px-5 py-4"
      >
        {total === null ? (
          <p className="m-0 text-text-muted">{CONTA.vazio}</p>
        ) : (
          <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-text-muted">{CONTA.resultado}</span>
            <span className="text-[clamp(1.6rem,3vw,2.4rem)] leading-none font-bold tracking-tight">
              {BRL.format(total)}
            </span>
          </p>
        )}
      </div>
      <p className="mt-4 mb-0 text-[0.95rem] leading-relaxed text-text-muted">{CONTA.nota}</p>
      <p className="mt-2 mb-0 text-meta text-text-subtle">{CONTA.privacidade}</p>
    </div>
  );
}
