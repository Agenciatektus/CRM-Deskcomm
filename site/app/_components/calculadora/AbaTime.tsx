"use client";

import { useId, useState } from "react";

import { CALCULADORA, CONTA } from "@/lib/conteudo";
import { IMPLANTACAO, LIMITES, calculaTime, lerCampo, type Plano } from "@/lib/conta";

import { BRL, Campo, PainelDeResultado, textoDoErro, useAtrasado } from "./Campo";

const T = CALCULADORA.time;

function Linha({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-text-muted">{rotulo}</dt>
      <dd className={`m-0 tabular-nums ${forte ? "text-lg font-bold" : "font-semibold"}`}>{valor}</dd>
    </div>
  );
}

/** Time de pessoas x time menor supervisionando a IA. Nenhum campo vem preenchido. */
export function AbaTime() {
  const base = useId();
  const [atendentes, setAtendentes] = useState("");
  const [custo, setCusto] = useState("");
  const [supervisao, setSupervisao] = useState("");
  const [plano, setPlano] = useState<Plano | null>(null);
  const [custoIA, setCustoIA] = useState("");
  const [exemplo, setExemplo] = useState(false);

  const n = lerCampo(atendentes, LIMITES.atendentes, true);
  const c = lerCampo(custo, LIMITES.custoPorAtendente);
  const s = lerCampo(supervisao, LIMITES.atendentes, true);
  const ia = lerCampo(custoIA, LIMITES.custoIA);
  const precisaIA = plano === "sem-ia";

  const erroN = textoDoErro(n, n.estado === "ok" && n.valor < 1 ? CALCULADORA.erros.atendentesZero : undefined);
  const erroS = textoDoErro(
    s,
    n.estado === "ok" && s.estado === "ok" && s.valor > n.valor ? CALCULADORA.erros.supervisaoMaior : undefined,
  );
  const erroC = textoDoErro(c);
  const erroIA = precisaIA ? textoDoErro(ia) : null;
  const temErro = !!(erroN || erroS || erroC || erroIA);

  const faltam: string[] = [];
  if (n.estado === "vazio") faltam.push(T.atendentes);
  if (c.estado === "vazio") faltam.push(T.custo);
  if (s.estado === "vazio") faltam.push(T.supervisao);
  if (plano === null) faltam.push(T.plano);
  if (precisaIA && ia.estado === "vazio") faltam.push(T.custoIA);
  const nadaPreenchido =
    n.estado === "vazio" && c.estado === "vazio" && s.estado === "vazio" && plano === null && ia.estado === "vazio";

  const r =
    !temErro &&
    n.estado === "ok" &&
    c.estado === "ok" &&
    s.estado === "ok" &&
    plano !== null &&
    (!precisaIA || ia.estado === "ok")
      ? calculaTime({
          atendentes: n.valor,
          custoPorAtendente: c.valor,
          supervisao: s.valor,
          plano,
          custoIA: precisaIA && ia.estado === "ok" ? ia.valor : 0,
        })
      : null;

  const anuncio = useAtrasado(
    r === null
      ? ""
      : r.economiaMes > 0
        ? `${T.economiaMes}: ${BRL.format(r.economiaMes)}. ${T.economiaAno}: ${BRL.format(r.economiaAno)}.`
        : r.economiaMes === 0
          ? T.zeroTexto
          : T.negativoTexto,
  );

  const usarExemplo = () => {
    setAtendentes("3");
    setCusto("2800");
    setSupervisao("1");
    setPlano("com-ia");
    setCustoIA("0");
    setExemplo(true);
  };
  const aoEditar = (set: (v: string) => void) => (v: string) => {
    set(v);
    setExemplo(false);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="flex flex-col gap-5 lg:col-span-5">
        <p className="m-0 text-[0.95rem] leading-relaxed text-text-muted">{T.intro}</p>
        <div>
          <button
            type="button"
            onClick={usarExemplo}
            className="min-h-10 cursor-pointer rounded-controle border border-border-strong px-4 text-[0.95rem] font-semibold text-text-muted hover:text-text"
          >
            {CALCULADORA.exemplo}
          </button>
          {exemplo ? (
            <p className="m-0 mt-2 text-meta leading-relaxed text-warning-fg" role="note">
              {CALCULADORA.exemploAviso}
            </p>
          ) : null}
        </div>
        <Campo id={`${base}-n`} rotulo={T.atendentes} valor={atendentes} aoMudar={aoEditar(setAtendentes)} erro={erroN} />
        <Campo id={`${base}-c`} rotulo={T.custo} valor={custo} aoMudar={aoEditar(setCusto)} erro={erroC} />
        <Campo id={`${base}-s`} rotulo={T.supervisao} valor={supervisao} aoMudar={aoEditar(setSupervisao)} erro={erroS} />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[0.95rem] font-semibold">{T.plano}</legend>
          {(
            [
              ["com-ia", T.comIA],
              ["sem-ia", T.semIA],
            ] as const
          ).map(([v, rotulo]) => (
            <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem]">
              <input
                type="radio"
                name={`${base}-plano`}
                checked={plano === v}
                onChange={() => {
                  setPlano(v);
                  setExemplo(false);
                }}
                className="size-4 accent-accent"
              />
              {rotulo}
            </label>
          ))}
        </fieldset>
        {precisaIA ? (
          <Campo id={`${base}-i`} rotulo={T.custoIA} valor={custoIA} aoMudar={aoEditar(setCustoIA)} erro={erroIA} />
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:col-span-7">
        <PainelDeResultado>
          {r === null ? (
            temErro ? (
              <p className="m-0 text-text-muted">{T.erro}</p>
            ) : nadaPreenchido ? (
              <p className="m-0 text-text-muted">{T.vazio}</p>
            ) : (
              <div className="text-text-muted">
                <p className="m-0">{T.parcial}</p>
                <ul className="mt-2 mb-0 pl-5">
                  {faltam.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )
          ) : (
            <>
              <p className="m-0 text-text-muted">{r.economiaMes < 0 ? T.negativoMes : T.economiaMes}</p>
              <p
                className={`m-0 mt-2 text-[clamp(2rem,4.2vw,3.4rem)] leading-none font-bold tracking-tight tabular-nums ${
                  r.economiaMes < 0 ? "text-warning-fg" : ""
                }`}
              >
                {BRL.format(Math.abs(r.economiaMes))}
              </p>
              <dl className="mt-6 mb-0">
                <Linha rotulo={T.hoje} valor={BRL.format(r.hoje)} />
                <Linha rotulo={T.depois} valor={BRL.format(r.comIA)} />
                <Linha
                  rotulo={r.economiaMes < 0 ? T.negativoAno : T.economiaAno}
                  valor={BRL.format(Math.abs(r.economiaAno))}
                  forte
                />
              </dl>
              {r.economiaMes < 0 ? (
                <p className="mt-4 mb-0 text-warning-fg">{T.negativoTexto}</p>
              ) : r.economiaMes === 0 ? (
                <p className="mt-4 mb-0 text-text-muted">{T.zeroTexto}</p>
              ) : r.mesesParaPagar !== null ? (
                <p className="mt-4 mb-0 text-text-muted">
                  {T.meses} {r.mesesParaPagar} {r.mesesParaPagar === 1 ? "mês" : "meses"} (implantação de{" "}
                  {BRL.format(IMPLANTACAO)}, pagamento único).
                </p>
              ) : null}
            </>
          )}
        </PainelDeResultado>
        <p className="m-0 text-[0.95rem] leading-relaxed text-text-muted">{CALCULADORA.honesta}</p>
        <p className="m-0 text-meta text-text-subtle">{CONTA.privacidade}</p>
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </div>
    </div>
  );
}
