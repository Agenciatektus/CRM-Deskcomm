"use client";
import Link from "next/link";
import type { ReactNode } from "react";

import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { NoDeFunis } from "@/components/shell/NoDeFunis";
import { useT } from "@/hooks/i18n/useT";
import type { FunilDoMenu } from "@/lib/navigation/funis-no-menu";
import { GRUPO_NO_RODAPE, type NavDestination, type NavGroup } from "@/lib/navigation/registry";
import { destinoDaRota } from "@/lib/navigation/rota-atual";
import { ArrowRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Item da coluna 2 marcado como a tela atual, e o resto. */
const ITEM_ATIVO = "bg-card ring-1 ring-border font-semibold text-foreground";
const ITEM_INATIVO = "text-muted-foreground hover:bg-accent/50 hover:text-foreground";

export type Secao = { section: string; items: NavDestination[] };

/** A coluna 2: título do grupo, telas por seção, o nó dos funis no CRM e o hub. */
export function ColunaDoGrupo({
  grupo,
  secoes,
  pathname,
  funis,
  onNavigate,
}: {
  grupo: NavGroup;
  secoes: Secao[];
  pathname: string;
  funis: readonly FunilDoMenu[];
  onNavigate: () => void;
}) {
  const t = useT();
  const comTitulo = secoes.length > 1;
  // O nó "Pipeline" fica logo abaixo de "Funis", que é a porta de administrar os
  // mesmos funis; sem "Funis" visível, no fim da primeira seção.
  const temFunis = secoes.some((s) => s.items.some((d) => d.href === "/app/kanban"));
  // UMA tela ativa, a do destino mais longo que casa: `/app/ai/cases/avisos` está
  // abaixo de `/app/ai/cases`, e casar por prefixo acenderia as duas.
  const hrefAtivo = destinoDaRota(pathname)?.href ?? null;

  return (
    <nav aria-label={t("Navegação principal")} className="flex min-h-0 flex-1 flex-col">
      <h2 className="flex h-14 shrink-0 items-center px-4 text-sm font-semibold text-foreground">
        {t(grupo.label)}
      </h2>
      <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-2">
        {secoes.map((secao, i) => (
          <div key={secao.section || i} className="space-y-1">
            {comTitulo && secao.section && (
              // O nome da seção é do REGISTRO (catalogo.ts), não do operador.
              <p className="px-3 pt-1 text-[11px] font-medium text-muted-foreground">
                {t(secao.section)}
              </p>
            )}
            <ul className="space-y-0.5">
              {secao.items.map((item) => (
                <ItemDaColuna key={item.href} item={item} ativo={item.href === hrefAtivo} onNavigate={onNavigate}>
                  {grupo.id === "crm" && item.href === "/app/kanban" && (
                    <NoDeFunis
                      funis={funis}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      classeAtiva={ITEM_ATIVO}
                      classeInativa={ITEM_INATIVO}
                      iconeSize={16}
                    />
                  )}
                </ItemDaColuna>
              ))}
              {grupo.id === "crm" && i === 0 && !temFunis && (
                <NoDeFunis
                  funis={funis}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  classeAtiva={ITEM_ATIVO}
                  classeInativa={ITEM_INATIVO}
                  iconeSize={16}
                />
              )}
            </ul>
          </div>
        ))}
        {grupo.hub && grupo.id !== GRUPO_NO_RODAPE && (
          <Link
            href={grupo.hub.href}
            aria-current={pathname === grupo.hub.href ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
              pathname === grupo.hub.href ? ITEM_ATIVO : ITEM_INATIVO,
            )}
          >
            <ArrowRight size={16} aria-hidden />
            <span className="truncate">{t(grupo.hub.label)}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * Uma tela na coluna. `children` é o que vem DEPOIS dela na lista (o nó dos
 * funis depois de "Funis"), devolvido como irmão para a `<ul>` seguir só de `<li>`.
 */
function ItemDaColuna({
  item,
  ativo,
  onNavigate,
  children,
}: {
  item: NavDestination;
  ativo: boolean;
  onNavigate: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const Icon = item.icon;
  return (
    <>
      <li>
        <Link
          href={item.href}
          aria-current={ativo ? "page" : undefined}
          onClick={onNavigate}
          className={cn(
            "relative flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
            ativo ? ITEM_ATIVO : ITEM_INATIVO,
          )}
        >
          <Icon size={16} weight={ativo ? "fill" : "regular"} aria-hidden />
          <span className="truncate">{t(item.label)}</span>
          {item.healthDot && <ConnectionHealthDot className="ml-auto" />}
          {item.contador === "casos" && <ContadorDeCasos compacto={false} />}
          {item.contador === "fila" && <ContadorDaFila compacto={false} />}
        </Link>
      </li>
      {children}
    </>
  );
}
