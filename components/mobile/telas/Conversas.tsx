"use client";
import type { ReactNode } from "react";

import type { InboxTab } from "@/components/inbox/InboxFilters";
import { useT } from "@/hooks/i18n/useT";
import { Archive, CaretLeft, CaretRight, CheckCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CampoDeBusca } from "../CampoDeBusca";

export interface AbaComContagem {
  value: InboxTab;
  label: string;
  count?: number;
}

/** As visões do dia, como chips (o `.chips` do protótipo). As do passado viram linha. */
const NOS_CHIPS: readonly InboxTab[] = ["unassigned", "mine", "all", "ai"];
const NAS_LINHAS: readonly InboxTab[] = ["closed", "archived"];

const ROTULO_DA_SUBTELA: Partial<Record<InboxTab, string>> = { closed: "Fechadas", archived: "Arquivadas" };

/**
 * O topo da lista de conversas NO CELULAR (o item 01 do protótipo): campo de busca,
 * faixa de chips com contagem (o filtro primeiro, depois Fila, Minhas, Todas, Com a
 * IA e Sem próximo passo) e as linhas "Fechadas N" e "Arquivadas N", que abrem a
 * subtela com voltar. Os dados e as regras são os da Inbox de sempre (`InboxFilters`):
 * isto só troca a forma, abaixo de 760px (`largo:hidden`).
 */
export function FiltrosDaInboxNoCelular({
  tab,
  semPasso,
  abas,
  onTab,
  onSemPasso,
  filtro,
  chipsAtivos,
}: {
  tab: InboxTab;
  semPasso: boolean;
  abas: AbaComContagem[];
  onTab: (tab: InboxTab) => void;
  onSemPasso: (ligado: boolean) => void;
  /** O gatilho dos filtros (o mesmo `PopoverDeFiltros`, que no celular é folha). */
  filtro: ReactNode;
  /** Os filtros ligados, cada um com o "x" (`ChipsDeFiltro`). */
  chipsAtivos: ReactNode;
}) {
  const t = useT();
  const subtela = NAS_LINHAS.includes(tab);

  if (subtela) {
    return (
      <div className="largo:hidden">
        <button
          type="button"
          onClick={() => onTab("unassigned")}
          className="pele-foco flex min-h-(--mb-alvo) items-center gap-0.5 rounded-full pr-3 pl-1 text-base font-bold text-accent-text"
        >
          <CaretLeft size={22} weight="bold" aria-hidden />
          {t("Conversas")}
        </button>
        <h2 className="px-4 pb-2 text-(length:--mb-titulo-fonte) leading-[1.1] font-bold text-text">
          {t(ROTULO_DA_SUBTELA[tab] ?? "")}
        </h2>
      </div>
    );
  }

  const chip = (ligado: boolean) =>
    cn(
      "relative flex h-(--mb-chip-altura) shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1",
      ligado
        ? "pele-grad-contador bg-accent text-accent-foreground"
        : "bg-surface-elevated text-text-muted shadow-[inset_0_0_0_1px_var(--color-border)]",
    );

  return (
    <div className="largo:hidden">
      <CampoDeBusca />
      <div role="group" aria-label={t("Filtrar conversas")} className="flex gap-2 overflow-x-auto px-4 pt-1.5 pb-3 scrollbar-none">
        {filtro}
        {abas
          .filter((a) => NOS_CHIPS.includes(a.value))
          .map((a) => (
            <button key={a.value} type="button" aria-pressed={tab === a.value} onClick={() => onTab(a.value)} className={chip(tab === a.value)}>
              {t(a.label)}
              {!!a.count && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-tint px-1.5 text-xs font-bold tabular-nums">{a.count}</span>
              )}
            </button>
          ))}
        <button type="button" aria-pressed={semPasso} onClick={() => onSemPasso(!semPasso)} className={chip(semPasso)}>
          {t("Sem próximo passo")}
        </button>
      </div>
      {chipsAtivos}
      {abas
        .filter((a) => NAS_LINHAS.includes(a.value))
        .map((a) => {
          const Icone = a.value === "closed" ? CheckCircle : Archive;
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => onTab(a.value)}
              className="pele-foco flex min-h-[50px] w-full items-center gap-4 pr-[18px] pl-[30px] text-left text-text-muted hover:bg-hover"
            >
              <Icone size={22} aria-hidden />
              <span className="flex-1 text-[15.5px] font-semibold text-text">{t(a.label)}</span>
              {!!a.count && <span className="text-sm text-text-subtle tabular-nums">{a.count}</span>}
              <CaretRight size={16} className="text-text-subtle" aria-hidden />
            </button>
          );
        })}
    </div>
  );
}
