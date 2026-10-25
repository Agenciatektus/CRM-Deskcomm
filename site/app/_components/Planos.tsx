"use client";

import { useId, useState } from "react";

import { GARANTIA_CONFIRMADA, OFERTA, linkWhatsapp } from "@/lib/conteudo";
import {
  anualCentavos,
  equivalenteMensalCentavos,
  mensagemDeAssinatura,
  reaisDeCentavos as reais,
  totalPrimeirosMesesCentavos,
  MENSAL_CENTAVOS,
  type Periodo,
  type Plano,
} from "@/lib/preco";

import { BotaoPrimario, BotaoSecundario } from "./Botao";
import { Icone } from "./ui/Icones";

const PLANOS: { id: Plano; indice: 0 | 1; destaque: boolean; icone: string }[] = [
  { id: "com-ia", indice: 0, destaque: true, icone: "cerebro" },
  { id: "sem-ia", indice: 1, destaque: false, icone: "cadeado" },
];

/** Seletor de dois estados (Mensal / Anual), botões com `aria-pressed`. */
function Periodos({ valor, aoMudar }: { valor: Periodo; aoMudar: (p: Periodo) => void }) {
  return (
    <div role="group" aria-label={OFERTA.periodoRotulo} className="pele-seg inline-flex gap-0.5 rounded-field border border-border p-[3px]">
      {(["mensal", "anual"] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={valor === p}
          onClick={() => aoMudar(p)}
          className={`min-h-9 cursor-pointer rounded-[7px] px-5 text-ui font-semibold transition-colors ${
            valor === p ? "pele-seg-item-on text-text" : "text-text-muted hover:text-text"
          }`}
        >
          {OFERTA[p]}
        </button>
      ))}
    </div>
  );
}

function Preco({ plano, periodo }: { plano: Plano; periodo: Periodo }) {
  if (periodo === "mensal") {
    return (
      <div>
        <p className="m-0 flex items-baseline gap-2">
          <span className="text-[3rem] leading-none font-bold tracking-tight tabular-nums">{reais(MENSAL_CENTAVOS[plano])}</span>
          <span className="text-text-muted">{OFERTA.porMes}</span>
        </p>
        <p className="m-0 mt-2 text-ui text-text-muted">{OFERTA.semFidelidade}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="m-0 flex items-baseline gap-2">
        <span className="text-[3rem] leading-none font-bold tracking-tight tabular-nums">{reais(equivalenteMensalCentavos(plano))}</span>
        <span className="text-text-muted">{OFERTA.equivalente}</span>
      </p>
      <p className="m-0 mt-2 text-ui text-text-muted tabular-nums">
        {reais(anualCentavos(plano))} {OFERTA.porAno}. {OFERTA.anualDescricao}.
      </p>
    </div>
  );
}

export function Planos() {
  const [periodo, setPeriodo] = useState<Periodo>("mensal");
  const [comImpl, setComImpl] = useState(false);
  const idImpl = useId();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Periodos valor={periodo} aoMudar={setPeriodo} />
      </div>

      {/* Os dois cartões dividem as mesmas linhas (subgrid): cada item do comparativo fica na mesma altura. */}
      <div className="grid items-stretch gap-x-8 gap-y-6 lg:grid-cols-2 [&>*]:min-w-0">
        {PLANOS.map((p) => {
          const dados = OFERTA.planos[p.indice];
          const chave = p.id === "com-ia" ? "comIA" : "semIA";
          return (
            <section
              key={p.id}
              aria-label={dados.nome}
              className={`card row-span-9 grid grid-rows-subgrid gap-y-4 rounded-modal p-8 lg:p-10 ${
                p.destaque ? "borda-luz luz luz-fraca" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 flex items-center gap-2.5 text-[1.15rem] font-bold">
                  <Icone nome={p.icone} className="size-6 text-link" /> {dados.nome}
                </h3>
                {p.destaque ? (
                  <span className="rounded-full border border-accent bg-accent-soft px-3 py-0.5 text-meta font-bold text-accent-text">
                    {OFERTA.recomendado}
                  </span>
                ) : null}
              </div>
              <Preco plano={p.id} periodo={periodo} />
              <p className="m-0 text-text-muted">
                {p.id === "com-ia" ? OFERTA.descComIA : OFERTA.descSemIA}
              </p>
              <div>
                {p.destaque ? (
                  <BotaoPrimario href={linkWhatsapp(mensagemDeAssinatura(p.id, periodo, comImpl))} externo>
                    {dados.botao}
                  </BotaoPrimario>
                ) : (
                  <BotaoSecundario href={linkWhatsapp(mensagemDeAssinatura(p.id, periodo, comImpl))} externo>
                    {dados.botao}
                  </BotaoSecundario>
                )}
                {/* TODO(checkout): a URL do checkout ainda não existe. Quando existir, entra aqui no lugar do WhatsApp. */}
              </div>
              {OFERTA.comparativo.map((linha) => {
                const c = linha[chave];
                return (
                  <p key={c.texto} className="m-0 flex items-start gap-2.5 border-t border-border pt-4 leading-snug">
                    <Icone
                      nome={c.estado === "incluso" ? "check" : "cadeado"}
                      className={`mt-0.5 size-5 shrink-0 ${c.estado === "incluso" ? "text-ok" : "text-text-muted"}`}
                    />
                    <span className={c.estado === "incluso" ? "" : "text-text-muted"}>{c.texto}</span>
                  </p>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="revela mt-8 rounded-grande border border-dashed border-border-strong p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-label font-semibold text-text-subtle">{OFERTA.implantacao.rotulo}</p>
            <p className="m-0 mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="text-[1.4rem] leading-none font-bold tracking-tight">{OFERTA.implantacao.preco}</span>
              <span className="text-text-muted">{OFERTA.implantacao.parcelas}</span>
            </p>
            <p className="m-0 mt-2 max-w-(--container-leitura) text-ui text-text-muted">
              {OFERTA.implantacao.aviso} {OFERTA.implantacaoDescricao}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor={idImpl} className="cursor-pointer text-[0.95rem] font-semibold">
              {OFERTA.implantacaoSeletor}
            </label>
            <button
              id={idImpl}
              type="button"
              role="switch"
              aria-checked={comImpl}
              onClick={() => setComImpl((v) => !v)}
              className={`relative h-11 w-16 shrink-0 cursor-pointer rounded-full border border-border-strong transition-colors duration-200 ${
                comImpl ? "bg-(image:--degrade)" : "pele-seg"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-1/2 left-1 size-8 -translate-y-1/2 rounded-full bg-text transition-transform duration-200 ${
                  comImpl ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        </div>

        <div
          aria-live="polite"
          className={`grid transition-[grid-template-rows] duration-300 ease-(--ease-lenta) ${comImpl ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="overflow-hidden" inert={!comImpl}>
            <ul className="m-0 mt-4 grid list-none gap-3 border-t border-border p-0 pt-4 text-ui md:grid-cols-2">
              {PLANOS.map((p) => (
                <li key={p.id} className="tabular-nums">
                  <b>{OFERTA.planos[p.indice].nome}</b>
                  <br />
                  {periodo === "mensal" ? (
                    <span className="text-text-muted">
                      {OFERTA.totalMensal}: {reais(totalPrimeirosMesesCentavos(p.id))} ({OFERTA.planoMaisParcela}).{" "}
                      {OFERTA.totalDepois}: {reais(MENSAL_CENTAVOS[p.id])} {OFERTA.porMes}
                      {p.id === "sem-ia" ? `, ${OFERTA.maisSuaIA}` : ""}.
                    </span>
                  ) : (
                    <span className="text-text-muted">
                      {reais(anualCentavos(p.id))} {OFERTA.porAno}. {OFERTA.parcelasAnual}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ul className="revela m-0 mt-8 flex list-none flex-wrap gap-x-8 gap-y-3 p-0 text-ui text-text-muted">
        {OFERTA.confianca.filter((c) => !c.exigeGarantia || GARANTIA_CONFIRMADA).map((c) => (
          <li key={c.texto} className="flex items-center gap-2">
            <Icone nome={c.icone} className="size-5 shrink-0 text-link" />
            {c.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
