"use client";

import { useEffect, useState, type ReactNode } from "react";

import { FolhaInferior } from "@/components/mobile/FolhaInferior";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import type { LeadFilters } from "@/lib/kanban/filters";
import { ehOrdemDoFunil, ORDENS_DO_FUNIL, type OrdemDoFunil } from "@/lib/kanban/ordem-do-funil";
import { ArrowsDownUp, CaretDown, Clock, Flag, MagnifyingGlass, Plus, SlidersHorizontal, UserCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { ChipsAtivos, chipsDosFiltros, useNomeDoDono, type ChipAtivo } from "./ChipsAtivos";

export interface ContagensDosAtalhos {
  atrasados: number;
  semPasso: number;
  parados: number;
}

/**
 * Linha 2 da barra do Funil: busca (nome, telefone, @ ou título), atalhos de
 * um toque com contagem, "Filtros (N)" e Ordenar; abaixo, os chips dos
 * filtros ativos. O painel é `painel` (o mesmo conteúdo nos dois tamanhos):
 * popover colado ao botão no desktop, folha inferior com "Ver N leads" no
 * celular.
 */
export function BarraDeBusca({
  filters,
  onChange,
  contagens,
  totalDoRecorte,
  ordem,
  onOrdem,
  userId,
  celular,
  painel,
}: {
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  contagens: ContagensDosAtalhos;
  totalDoRecorte: number;
  ordem: OrdemDoFunil;
  onOrdem: (o: OrdemDoFunil) => void;
  userId: string;
  celular: boolean;
  painel: ReactNode;
}) {
  const t = useT();
  const [busca, setBusca] = useState(filters.search ?? "");
  const [painelAberto, setPainelAberto] = useState(false);
  const nomeDoDono = useNomeDoDono(userId);
  const chips = chipsDosFiltros(filters, t, nomeDoDono);

  // Resultado enquanto digita, com 250 ms de folga (a query string muda a cada aplicação).
  useEffect(() => {
    const id = setTimeout(() => {
      if ((filters.search ?? "") !== busca) onChange({ ...filters, search: busca });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);
  // "Limpar tudo" (ou um link novo) zera a busca de fora: o campo acompanha.
  const [buscaDeFora, setBuscaDeFora] = useState(filters.search ?? "");
  if ((filters.search ?? "") !== buscaDeFora) {
    setBuscaDeFora(filters.search ?? "");
    if (!filters.search) setBusca("");
  }

  const atalho = (chave: "meus" | "overdueOnly" | "semPasso" | "parados") => () =>
    onChange({ ...filters, [chave]: filters[chave] ? undefined : true });
  const limparTudo = () => {
    setBusca("");
    onChange({ status: "open" });
  };
  const remover = (c: ChipAtivo) => onChange({ ...filters, ...c.remover });
  const rotuloDaOrdem = t(ORDENS_DO_FUNIL.find((o) => o.id === ordem)?.rotulo ?? "");

  const botaoFiltros = (
    <Button variant="outline" size="sm" className="gap-1.5 mb:min-h-11" aria-haspopup="dialog" onClick={celular ? () => setPainelAberto(true) : undefined}>
      <SlidersHorizontal size={16} aria-hidden />
      {t("Filtros")}
      {chips.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs text-accent-foreground tabular-nums">{chips.length}</span>}
    </Button>
  );

  return (
    <div className={cn("flex flex-col gap-2", !celular && "rounded-lg border border-border bg-surface p-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full largo:w-80">
          <span className="sr-only">{t("Buscar leads")}</span>
          <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-subtle" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={celular ? t("Nome, telefone, @ ou título") : t("Buscar por nome, telefone, @ do Instagram ou título")}
            className="h-9 w-full rounded-md border border-border bg-surface-elevated pr-3 pl-8 text-sm text-text placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-accent mb:h-11"
          />
        </label>
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto scrollbar-none">
          {celular && botaoFiltros}
          <Chip ligado={!!filters.meus} onClick={atalho("meus")} className="mb:h-11">
            <UserCircle aria-hidden />
            {t("Meus")}
          </Chip>
          <Chip ligado={!!filters.overdueOnly} onClick={atalho("overdueOnly")} className="mb:h-11">
            <Clock aria-hidden />
            {t("Atrasados")} <span className="tabular-nums opacity-70">{contagens.atrasados}</span>
          </Chip>
          <Chip ligado={!!filters.semPasso} onClick={atalho("semPasso")} className="mb:h-11">
            <Plus aria-hidden />
            {t("Sem próximo passo")} <span className="tabular-nums opacity-70">{contagens.semPasso}</span>
          </Chip>
          <Chip ligado={!!filters.parados} onClick={atalho("parados")} className="mb:h-11">
            <Flag aria-hidden />
            {t("Parados")} <span className="tabular-nums opacity-70">{contagens.parados}</span>
          </Chip>
        </div>
        <div className={cn("flex items-center gap-2", celular ? "w-full" : "ml-auto")}>
          {!celular && (
            <Popover open={painelAberto} onOpenChange={setPainelAberto}>
              <PopoverTrigger asChild>{botaoFiltros}</PopoverTrigger>
              <PopoverContent align="end" className="max-h-[70dvh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto p-0">
                {painel}
                <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                  <Button variant="ghost" size="sm" onClick={limparTudo}>{t("Limpar tudo")}</Button>
                  <Button size="sm" onClick={() => setPainelAberto(false)}>
                    {`${t("Ver")} ${totalDoRecorte} ${totalDoRecorte === 1 ? t("lead") : t("leads")}`}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 mb:min-h-11">
                <ArrowsDownUp size={16} aria-hidden />
                <span className="text-text-muted">{t("Ordenar:")}</span>
                <span className="max-w-48 truncate">{rotuloDaOrdem}</span>
                <CaretDown size={14} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" folhaNoCelular className="w-80">
              <DropdownMenuLabel>{t("Ordenar por")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={ordem} onValueChange={(v) => ehOrdemDoFunil(v) && onOrdem(v)}>
                {ORDENS_DO_FUNIL.map((o) => (
                  <DropdownMenuRadioItem key={o.id} value={o.id} className="h-auto items-start whitespace-normal py-2">
                    <span className="flex flex-col">
                      <span className="font-medium">{t(o.rotulo)}</span>
                      <span className="text-xs text-text-muted">{t(o.apoio)}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <p className="px-2 pt-1 pb-2 text-xs text-text-subtle">{t("Vale para o Kanban e a Lista. Fica salvo para você.")}</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ChipsAtivos chips={chips} onRemover={remover} onLimpar={limparTudo} />
      {celular && (
        <FolhaInferior aberto={painelAberto} aoMudar={setPainelAberto} titulo={t("Filtros")}>
          {painel}
          <div className="sticky bottom-0 flex gap-2 bg-surface p-3">
            <Button variant="ghost" className="min-h-11" onClick={limparTudo}>{t("Limpar tudo")}</Button>
            <Button className="min-h-11 flex-1" onClick={() => setPainelAberto(false)}>
              {`${t("Ver")} ${totalDoRecorte} ${totalDoRecorte === 1 ? t("lead") : t("leads")}`}
            </Button>
          </div>
        </FolhaInferior>
      )}
    </div>
  );
}
