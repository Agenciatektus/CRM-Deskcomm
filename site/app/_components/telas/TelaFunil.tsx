"use client";

import { useId, useMemo, useState } from "react";

import { Icone } from "../ui/Icones";
import { BarraGlobalDoApp, RailDoApp, TopoDoApp } from "./CascaDoApp";
import { Coluna } from "./funil/Coluna";
import { CHIPS, FUNIS, contagem, passa, reais, resumo, type Chip } from "./funil/dados";

/**
 * O quadro do funil do CRM (CabecalhoDoFunil, BarraDeBusca, StageColumn e KanbanCard), com dados
 * FICTÍCIOS. Dois pontos interativos, os mesmos do produto: o seletor de funil (o título troca os
 * dados de exemplo) e os chips de atalho, que filtram os cartões, a soma das etapas e o resumo.
 * O HTML do servidor já traz o primeiro funil completo; o JavaScript só troca o recorte.
 */
export function TelaFunil() {
  const [funilId, setFunilId] = useState(FUNIS[0]!.id);
  const [aberto, setAberto] = useState(false);
  const [ativos, setAtivos] = useState<ReadonlySet<Chip>>(new Set());
  const [busca, setBusca] = useState("");
  const menuId = useId();

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

  return (
    <div className="@container flex h-[560px] bg-bg text-text xl:h-[720px]">
      <RailDoApp ativo="CRM" />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraGlobalDoApp />

        <TopoDoApp
          titulo={
            <div
              className="relative"
              onKeyDown={(e) => e.key === "Escape" && setAberto(false)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setAberto(false);
              }}
            >
              <button
                type="button"
                aria-expanded={aberto}
                aria-controls={menuId}
                aria-label={`Funil: ${funil.nome}. Trocar de funil`}
                onClick={() => setAberto((v) => !v)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-card text-left text-xl font-bold tracking-[-0.01em] hover:text-accent-text"
              >
                {funil.nome}
                <Icone nome="chevron" peso="bold" className="size-3.5 rotate-90 text-text-muted" />
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
          }
        >
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
            <span className="font-semibold text-text tabular-nums">
              {abertos} {abertos === 1 ? "aberto" : "abertos"}
            </span>
            <span className="text-text-muted tabular-nums">{reais(soma)}</span>
            {atrasados ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-error-bg px-2.5 py-0.5 text-meta font-bold text-error-fg tabular-nums">
                <Icone nome="relogio" className="size-3.5" />
                {atrasados} {atrasados === 1 ? "atrasado" : "atrasados"}
              </span>
            ) : null}
          </p>
          <span aria-hidden="true" className="ml-auto hidden items-center gap-2 md:flex">
            <span className="pele-seg flex gap-0.5 rounded-field border border-border p-[3px] text-text-muted">
              <span className="pele-seg-item-on grid h-7 w-8 place-items-center rounded-[7px] text-text">
                <Icone nome="painel" className="size-4" />
              </span>
              <span className="grid h-7 w-8 place-items-center">
                <Icone nome="opcoes" className="size-4" />
              </span>
              <span className="grid h-7 w-8 place-items-center">
                <Icone nome="calendario" className="size-4" />
              </span>
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-controle bg-(image:--degrade) px-3.5 text-[13px] font-semibold text-white">
              <Icone nome="mais" peso="bold" className="size-3.5" /> Novo Lead
            </span>
          </span>
        </TopoDoApp>

        <div className="m-3 mb-0 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <label className="flex h-9 w-full min-w-0 items-center gap-2 rounded-field border border-border-strong bg-surface-2 px-3 text-[13px] text-text-subtle sm:w-80">
            <Icone nome="busca" className="size-4 shrink-0" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar por nome ou etiqueta"
              placeholder="Buscar por nome, telefone ou título"
              className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-subtle"
            />
          </label>
          {CHIPS.map((c) => {
            const n = c.id === "meus" ? 0 : contagem(funil, c.id);
            const on = ativos.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => alterna(c.id)}
                className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-meta font-semibold transition-colors ${
                  on
                    ? "border-accent bg-accent-soft text-text"
                    : "border-border-strong text-text-muted hover:text-text"
                }`}
              >
                {c.rotulo}
                {c.id !== "meus" ? <span className="text-text-subtle tabular-nums">{n}</span> : null}
              </button>
            );
          })}
          <span aria-hidden="true" className="ml-auto hidden items-center gap-3 text-meta font-semibold text-text-muted lg:flex">
            <span className="inline-flex items-center gap-1">
              <Icone nome="filtro" className="size-3.5" /> Filtros
            </span>
            <span>Ordenar: mais recentes</span>
          </span>
        </div>

        {/* Quadro: rola na horizontal, com a barra visível; cabeçalhos de etapa grudados no alto. */}
        <div
          role="region"
          aria-label="Etapas do funil, role para o lado"
          tabIndex={0}
          className="hidden min-h-0 flex-1 overflow-auto p-3 [scrollbar-color:var(--color-border-strong)_transparent] md:block"
        >
          <div className="flex w-max items-start gap-3">
            {etapas.map((e) => (
              <Coluna key={e.nome} etapa={e} cartoes={e.cartoes} />
            ))}
          </div>
        </div>

        {/* Celular: lista de etapas empilhada, sem forçar o quadro horizontal. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:hidden">
          {etapas.map((e) => (
            <Coluna key={e.nome} etapa={e} cartoes={e.cartoes} lista />
          ))}
        </div>
      </div>
    </div>
  );
}
