"use client";

import { useId, useState } from "react";

import { CALCULADORA, CONTA } from "@/lib/conteudo";
import { LIMITES, lerCampo, perdaDoVacuo } from "@/lib/conta";

import { BRL, Campo, PainelDeResultado, textoDoErro, useAtrasado } from "./Campo";

/** A conta do vácuo: conversas x fatia sem resposta x ticket. Sem valor pré-preenchido. */
export function AbaVacuo() {
  const base = useId();
  const [conversas, setConversas] = useState("");
  const [fatia, setFatia] = useState("");
  const [ticket, setTicket] = useState("");

  const c = lerCampo(conversas, LIMITES.conversas);
  const f = lerCampo(fatia, 100);
  const t = lerCampo(ticket, LIMITES.ticket);
  const total = c.estado === "ok" && f.estado === "ok" && t.estado === "ok" ? perdaDoVacuo(c.valor, f.valor, t.valor) : null;
  const algumErro = [c, f, t].some((l) => l.estado === "erro");
  const anuncio = useAtrasado(total === null ? "" : `${CONTA.resultado} ${BRL.format(total)}`);

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="flex flex-col gap-5 lg:col-span-5">
        <Campo id={`${base}-c`} rotulo={CONTA.campo1} valor={conversas} aoMudar={setConversas} erro={textoDoErro(c)} />
        <Campo id={`${base}-f`} rotulo={CONTA.campo2} valor={fatia} aoMudar={setFatia} erro={textoDoErro(f)} max={100} />
        <Campo id={`${base}-t`} rotulo={CONTA.campo3} valor={ticket} aoMudar={setTicket} erro={textoDoErro(t)} />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-7">
        <PainelDeResultado>
          {total !== null ? (
            <>
              <p className="m-0 text-text-muted">{CONTA.resultado}</p>
              <p className="m-0 mt-2 text-[clamp(2rem,4.2vw,3.4rem)] leading-none font-bold tracking-tight tabular-nums">
                {BRL.format(total)}
              </p>
            </>
          ) : (
            <p className="m-0 text-text-muted">{algumErro ? CALCULADORA.time.erro : CONTA.vazio}</p>
          )}
        </PainelDeResultado>
        <p className="m-0 text-[0.95rem] leading-relaxed text-text-muted">{CONTA.nota}</p>
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </div>
    </div>
  );
}
