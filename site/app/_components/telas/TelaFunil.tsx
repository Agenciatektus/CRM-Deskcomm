"use client";

import { useId, useMemo, useRef, useState } from "react";

import { Icone } from "../ui/Icones";
import { BarraGlobalDoApp, RailDoApp } from "./CascaDoApp";
import { BarraFunil } from "./funil/BarraFunil";
import { CabecalhoFunil } from "./funil/CabecalhoFunil";
import { Coluna } from "./funil/Coluna";
import { FUNIS, passa, resumo, type Chip } from "./funil/dados";

/**
 * O quadro do funil do CRM (CabecalhoDoFunil, BarraDeBusca, StageColumn e KanbanCard), com dados
 * FICTÍCIOS. Pontos interativos: o seletor de funil (troca os dados), os atalhos e a busca (filtram
 * cartões, soma das etapas e resumo), "N atrasados" (liga o atalho de mesmo nome) e a densidade.
 * O HTML do servidor já traz o primeiro funil completo; o JavaScript só troca o recorte.
 */
export function TelaFunil() {
  const [funilId, setFunilId] = useState(FUNIS[0]!.id);
  const [aberto, setAberto] = useState(false);
  const [ativos, setAtivos] = useState<ReadonlySet<Chip>>(new Set());
  const [busca, setBusca] = useState("");
  const [compacto, setCompacto] = useState(false);
  const menuId = useId();
  const gatilho = useRef<HTMLButtonElement>(null);

  const funil = FUNIS.find((f) => f.id === funilId) ?? FUNIS[0]!;
  const etapas = useMemo(
    () => funil.etapas.map((e) => ({ ...e, cartoes: e.cartoes.filter((k) => passa(k, ativos, busca)) })),
    [funil, ativos, busca],
  );
  const { abertos, soma, atrasados } = resumo(etapas);

  const alterna = (c: Chip) =>
    setAtivos((a) => {
      const n = new Set(a);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const seletor = (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          setAberto(false);
          gatilho.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAberto(false);
      }}
    >
      <button
        ref={gatilho}
        type="button"
        aria-expanded={aberto}
        aria-controls={menuId}
        aria-label={`Funil: ${funil.nome}. Trocar de funil`}
        onClick={() => setAberto((v) => !v)}
        className="inline-flex h-7.5 cursor-pointer items-center gap-1.5 rounded-md px-2 text-label font-semibold text-text-muted hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        Trocar funil
        <Icone nome="caretDown" peso="regular" className="size-3.5" />
      </button>
      {aberto ? (
        <ul
          id={menuId}
          className="absolute top-full left-0 z-30 m-0 mt-1.5 min-w-60 list-none rounded-card border border-border-strong bg-surface-elevated p-1 shadow-(--shadow-e2)"
        >
          {FUNIS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                aria-pressed={f.id === funil.id}
                onClick={() => {
                  setFunilId(f.id);
                  setAberto(false);
                }}
                className={`flex h-9 w-full cursor-pointer items-center justify-between gap-3 rounded-controle px-3 text-ui font-semibold hover:bg-hover ${
                  f.id === funil.id ? "text-text" : "text-text-muted"
                }`}
              >
                {f.nome}
                {f.id === funil.id ? <Icone nome="check" peso="bold" className="size-3.5 text-ok" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  return (
    <div className="@container flex h-[560px] bg-bg text-text xl:h-[720px]">
      <RailDoApp ativo="CRM" />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraGlobalDoApp />

        <div className="flex flex-col gap-2 px-4 pt-2 pb-3 max-md:pt-3">
          <CabecalhoFunil
            titulo={funil.nome}
            seletor={seletor}
            abertos={abertos}
            soma={soma}
            atrasados={atrasados}
            atrasadosLigado={ativos.has("atrasados")}
            onAtrasados={() => alterna("atrasados")}
            compacto={compacto}
            onCompacto={setCompacto}
          />
          <BarraFunil funil={funil} busca={busca} onBusca={setBusca} ativos={ativos} onAlterna={alterna} />
        </div>

        {/* Quadro: rola na horizontal, com a barra visível; cabeçalhos de etapa grudados no alto. */}
        <div
          role="region"
          aria-label="Etapas do funil, role para o lado"
          tabIndex={0}
          className="hidden min-h-0 flex-1 overflow-auto px-4 pb-4 [scrollbar-color:var(--color-border-strong)_transparent] md:block"
        >
          <div className="flex w-max items-start gap-3">
            {etapas.map((e) => (
              <Coluna key={e.nome} etapa={e} cartoes={e.cartoes} compacto={compacto} />
            ))}
          </div>
        </div>

        {/* Celular: lista de etapas empilhada, sem forçar o quadro horizontal. */}
        <div
          role="region"
          aria-label="Etapas do funil, lista"
          tabIndex={0}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 md:hidden"
        >
          {etapas.map((e) => (
            <Coluna key={e.nome} etapa={e} cartoes={e.cartoes} lista compacto={compacto} />
          ))}
        </div>
      </div>
    </div>
  );
}
