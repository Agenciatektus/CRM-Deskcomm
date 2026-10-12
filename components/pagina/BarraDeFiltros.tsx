"use client";
import { useState, type ReactNode } from "react";

import { FolhaInferior } from "@/components/mobile/FolhaInferior";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { Funnel, MagnifyingGlass } from "@/lib/ui/icons";

export interface BuscaDaPagina {
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder: string;
}

/**
 * A busca da página: 36px no desktop; no celular, o campo do protótipo (44px, raio
 * 14, texto de 16px, que não deixa o iOS dar zoom).
 */
export function CampoDeBuscaDaPagina({ valor, aoMudar, placeholder }: BuscaDaPagina) {
  return (
    <div className="relative w-full sm:w-72 mb:min-w-0 mb:flex-1">
      <MagnifyingGlass
        size={16}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="new-password"
        className="h-9 w-full pl-8 mb:h-(--mb-busca-altura) mb:rounded-(--mb-busca-raio) mb:text-(length:--mb-campo-fonte)"
      />
    </div>
  );
}

/**
 * A barra de filtros da página. Desktop: busca e filtros numa faixa só, com "Limpar
 * filtros" quando há algum ligado. Celular: a busca na largura toda e um botão
 * "Filtros" (com a contagem) que abre a folha inferior com os MESMOS controles,
 * empilhados. Os controles são do chamador e controlados por ele: a folha só os
 * monta enquanto está aberta, então o estado é um só.
 */
export function BarraDeFiltros({
  busca,
  children,
  ativos = 0,
  aoLimpar,
}: {
  busca?: BuscaDaPagina;
  children?: ReactNode;
  /** Quantos filtros (fora a busca) estão ligados: a contagem do botão do celular. */
  ativos?: number;
  aoLimpar?: () => void;
}) {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  const limpar =
    aoLimpar && (ativos > 0 || !!busca?.valor) ? (
      <Button variant="ghost" size="sm" onClick={aoLimpar}>
        {t("Limpar filtros")}
      </Button>
    ) : null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 mb:flex-nowrap mb:rounded-none mb:border-0 mb:bg-transparent mb:px-4 mb:py-0">
        {busca ? <CampoDeBuscaDaPagina {...busca} /> : null}
        {children ? <div className="contents mb:hidden">{children}</div> : null}
        {limpar ? <div className="contents mb:hidden">{limpar}</div> : null}
        {children ? (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setAberta(true)}
            className="pele-foco hidden h-(--mb-busca-altura) shrink-0 items-center gap-1.5 rounded-(--mb-busca-raio) bg-surface-elevated px-3.5 text-sm font-semibold text-text shadow-[inset_0_0_0_1px_var(--color-border)] mb:flex"
          >
            <Funnel size={18} aria-hidden />
            {t("Filtros")}
            {ativos > 0 ? (
              <span className="pele-grad-contador grid min-w-5 place-items-center rounded-full bg-accent px-1 text-xs tabular-nums text-accent-foreground">
                {ativos}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      {children ? (
        <FolhaInferior aberto={aberta} aoMudar={setAberta} titulo={t("Filtros")}>
          <div className="flex flex-col items-stretch gap-2 px-3 pb-3 [&>*]:min-h-(--mb-alvo) [&>*]:w-full [&>*]:justify-start">
            {children}
            {limpar}
          </div>
        </FolhaInferior>
      ) : null}
    </>
  );
}
