"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ChipsAtivos, type ChipAtivo } from "@/components/kanban/barra/ChipsAtivos";
import { FolhaInferior } from "@/components/mobile/FolhaInferior";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import {
  AGRUPAMENTOS,
  ORDENS_DAS_TAREFAS,
  quantosNoPainel,
  type Agrupamento,
  type ContagensDosAtalhos,
  type FiltrosDeTarefas,
  type OrdemDasTarefas,
} from "@/lib/tarefas/recorte";
import { ArrowsDownUp, CalendarBlank, CaretDown, Clock, MagnifyingGlass, SlidersHorizontal, UserCircle, UserMinus } from "@/lib/ui/icons";

import { AtalhoComContagem } from "./AtalhoComContagem";
import type { FunilDoPainel } from "./PainelDeFiltrosDasTarefas";
import {
  rotulosDaOrdem,
  rotulosDaPrioridade,
  rotulosDaSituacao,
  rotulosDoAgrupamento,
  rotulosDoPeriodo,
  rotulosDoVinculo,
} from "./rotulos";

type T = (s: string) => string;
type ChipDaTarefa = ChipAtivo<Partial<FiltrosDeTarefas>>;

/**
 * Os filtros DO PAINEL que estão ligados, um chip por grupo. O número do botão
 * "Filtros" é o tamanho desta lista (`quantosNoPainel` conta os mesmos
 * grupos): o número e os chips nunca discordam.
 */
export function chipsDasTarefas(f: FiltrosDeTarefas, t: T, nomeDe: (id: string) => string, funis: FunilDoPainel[]): ChipDaTarefa[] {
  const chips: ChipDaTarefa[] = [];
  if (f.responsavel) {
    const quem = f.responsavel === "eu" ? t("Eu") : f.responsavel === "sem" ? t("Sem responsável") : nomeDe(f.responsavel);
    chips.push({ chave: "resp", rotulo: `${t("Responsável")}: ${quem}`, remover: { responsavel: undefined } });
  }
  if (f.situacao && f.situacao !== "aberto") {
    chips.push({ chave: "situacao", rotulo: `${t("Situação")}: ${rotulosDaSituacao(t)[f.situacao]}`, remover: { situacao: undefined } });
  }
  if (f.prioridades?.length) {
    const r = rotulosDaPrioridade(t);
    chips.push({ chave: "prio", rotulo: `${t("Prioridade")}: ${f.prioridades.map((p) => r[p]).join(", ")}`, remover: { prioridades: undefined } });
  }
  if (f.periodo) chips.push({ chave: "periodo", rotulo: `${t("Prazo")}: ${rotulosDoPeriodo(t)[f.periodo]}`, remover: { periodo: undefined } });
  if (f.vinculo) chips.push({ chave: "vinculo", rotulo: `${t("Vínculo")}: ${rotulosDoVinculo(t)[f.vinculo]}`, remover: { vinculo: undefined } });
  if (f.funil) {
    const funil = funis.find((x) => x.id === f.funil);
    const etapa = funil?.etapas.find((e) => e.id === f.etapa);
    const nome = `${funil?.name ?? t("Funil")}${etapa ? ` · ${etapa.name}` : ""}`;
    chips.push({ chave: "funil", rotulo: `${t("Funil")}: ${nome}`, remover: { funil: undefined, etapa: undefined } });
  }
  return chips;
}

/**
 * A BARRA DE FILTROS da tela de Tarefas, no padrão da barra do Funil
 * (`BarraDeBusca`): busca (título, descrição, negócio ou contato), atalhos de
 * um toque com contagem ("Minhas", "Atrasadas N", "Hoje N", "Sem responsável
 * N"), "Filtros (N)" com o painel e "Ordenar" (com o agrupamento); embaixo, os
 * chips dos filtros ligados. Popover no desktop, folha inferior no celular.
 */
export function BarraDeFiltrosDasTarefas({
  filtros,
  onChange,
  contagens,
  totalDoRecorte,
  celular,
  painel,
  nomeDe,
  funis,
}: {
  filtros: FiltrosDeTarefas;
  onChange: (f: FiltrosDeTarefas) => void;
  contagens: ContagensDosAtalhos;
  totalDoRecorte: number;
  celular: boolean;
  painel: ReactNode;
  nomeDe: (id: string) => string;
  funis: FunilDoPainel[];
}) {
  const t = useT();
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [painelAberto, setPainelAberto] = useState(false);
  const chips = chipsDasTarefas(filtros, t, nomeDe, funis);

  // Resultado enquanto digita, com 250 ms de folga (a URL muda a cada aplicação).
  useEffect(() => {
    const id = setTimeout(() => {
      if ((filtros.busca ?? "") !== busca) onChange({ ...filtros, busca: busca || undefined });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);
  // "Limpar tudo" (ou um link novo) zera a busca de fora: o campo acompanha.
  const [buscaDeFora, setBuscaDeFora] = useState(filtros.busca ?? "");
  if ((filtros.busca ?? "") !== buscaDeFora) {
    setBuscaDeFora(filtros.busca ?? "");
    if (!filtros.busca) setBusca("");
  }

  const atalho = (chave: "minhas" | "atrasadas" | "hoje" | "semResponsavel") => () =>
    onChange({ ...filtros, [chave]: filtros[chave] ? undefined : true });
  // Limpar não desfaz o COMO (ordem e agrupamento): só o QUE.
  const limparTudo = () => {
    setBusca("");
    onChange({ ordem: filtros.ordem, agrupar: filtros.agrupar });
  };
  const ordens = rotulosDaOrdem(t);
  const agrupamentos = rotulosDoAgrupamento(t);
  const ordem = filtros.ordem ?? "prazo";
  const agrupar = filtros.agrupar ?? "prazo";
  const noPainel = quantosNoPainel(filtros);
  const ver = `${t("Ver")} ${totalDoRecorte} ${totalDoRecorte === 1 ? t("tarefa") : t("tarefas")}`;

  const botaoFiltros = (
    <Button variant="outline" size="sm" className="gap-1.5 mb:min-h-11" aria-haspopup="dialog" onClick={celular ? () => setPainelAberto(true) : undefined}>
      <SlidersHorizontal size={16} aria-hidden />
      {t("Filtros")}
      {noPainel > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs text-accent-foreground tabular-nums">{noPainel}</span>}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full largo:w-80">
          <span className="sr-only">{t("Buscar tarefas")}</span>
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar por título, negócio ou contato")}
            className="h-9 w-full rounded-md border border-border bg-surface-elevated pr-3 pl-8 text-sm text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-accent mb:h-11"
          />
        </label>
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto scrollbar-none">
          {celular && botaoFiltros}
          <AtalhoComContagem ligado={!!filtros.minhas} onClick={atalho("minhas")} icone={<UserCircle aria-hidden />} rotulo={t("Minhas")} />
          <AtalhoComContagem
            ligado={!!filtros.atrasadas}
            onClick={atalho("atrasadas")}
            icone={<Clock aria-hidden />}
            rotulo={t("Atrasadas")}
            contagem={contagens.atrasadas}
            alerta
          />
          <AtalhoComContagem ligado={!!filtros.hoje} onClick={atalho("hoje")} icone={<CalendarBlank aria-hidden />} rotulo={t("Hoje")} contagem={contagens.hoje} />
          <AtalhoComContagem
            ligado={!!filtros.semResponsavel}
            onClick={atalho("semResponsavel")}
            icone={<UserMinus aria-hidden />}
            rotulo={t("Sem responsável")}
            contagem={contagens.semResponsavel}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!celular && (
            <Popover open={painelAberto} onOpenChange={setPainelAberto}>
              <PopoverTrigger asChild>{botaoFiltros}</PopoverTrigger>
              <PopoverContent align="end" className="max-h-[70dvh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto p-0">
                {painel}
                <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                  <Button variant="ghost" size="sm" onClick={limparTudo}>{t("Limpar tudo")}</Button>
                  <Button size="sm" onClick={() => setPainelAberto(false)}>{ver}</Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 mb:min-h-11">
                <ArrowsDownUp size={16} aria-hidden />
                <span className="text-text-muted">{t("Ordenar:")}</span>
                <span className="max-w-48 truncate">{ordens[ordem]}</span>
                <CaretDown size={14} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" folhaNoCelular className="w-64">
              <DropdownMenuLabel>{t("Ordenar dentro do grupo")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={ordem}
                onValueChange={(v) => onChange({ ...filtros, ordem: v === "prazo" ? undefined : (v as OrdemDasTarefas) })}
              >
                {ORDENS_DAS_TAREFAS.map((o) => (
                  <DropdownMenuRadioItem key={o} value={o}>{ordens[o]}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("Agrupar")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={agrupar}
                onValueChange={(v) => onChange({ ...filtros, agrupar: v === "prazo" ? undefined : (v as Agrupamento) })}
              >
                {AGRUPAMENTOS.map((a) => (
                  <DropdownMenuRadioItem key={a} value={a}>{agrupamentos[a]}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <p className="px-2 pt-1 pb-2 text-xs text-text-subtle">{t("Fica salvo para você.")}</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ChipsAtivos<Partial<FiltrosDeTarefas>> chips={chips} onRemover={(c) => onChange({ ...filtros, ...c.remover })} onLimpar={limparTudo} />
      {celular && (
        <FolhaInferior aberto={painelAberto} aoMudar={setPainelAberto} titulo={t("Filtros")}>
          {painel}
          <div className="sticky bottom-0 flex gap-2 bg-surface p-3">
            <Button variant="ghost" className="min-h-11" onClick={limparTudo}>{t("Limpar tudo")}</Button>
            <Button className="min-h-11 flex-1" onClick={() => setPainelAberto(false)}>{ver}</Button>
          </div>
        </FolhaInferior>
      )}
    </div>
  );
}
