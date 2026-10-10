"use client";
import Link from "next/link";
import type { ReactNode } from "react";

import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeAvisos } from "@/components/shell/ContadorDeAvisos";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { NoDeFunis } from "@/components/shell/NoDeFunis";
import { useT } from "@/hooks/i18n/useT";
import type { FunilDoMenu } from "@/lib/navigation/funis-no-menu";
import type { NavDestination, NavGroup } from "@/lib/navigation/registry";
import { destinoDaRota } from "@/lib/navigation/rota-atual";
import { cn } from "@/lib/utils";

/** Item da coluna 2 marcado como a tela atual, e o resto. */
const ITEM_ATIVO = "pele-ativo-item bg-card ring-1 ring-border font-semibold text-foreground";
const ITEM_INATIVO = "text-muted-foreground hover:bg-accent/50 hover:text-foreground";

export type Secao = { section: string; items: NavDestination[] };

/** A coluna 2: título do grupo, telas por seção, o nó dos funis no CRM e o hub. */
export function ColunaDoGrupo({
  grupo,
  secoes,
  pathname,
  funis,
  onNavigate,
  acaoDoTitulo,
}: {
  grupo: NavGroup;
  secoes: Secao[];
  pathname: string;
  funis: readonly FunilDoMenu[];
  onNavigate: () => void;
  /** Um controle ao lado do título (o « de recolher a barra). Quem decide é a barra. */
  acaoDoTitulo?: ReactNode;
}) {
  const t = useT();
  const comTitulo = secoes.length > 1;
  // O nó dos quadros de funil fica logo abaixo de "Funis", que é a porta de administrar os
  // mesmos funis; sem "Funis" visível, no fim da primeira seção.
  const temFunis = temOQuadroDeFunis(secoes);
  // UMA tela ativa, a do destino mais longo que casa: `/app/ai/cases/avisos` está
  // abaixo de `/app/ai/cases`, e casar por prefixo acenderia as duas.
  const hrefAtivo = destinoDaRota(pathname)?.href ?? null;

  return (
    <nav aria-label={t("Navegação principal")} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1.5 pl-4 pr-2">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-foreground">{t(grupo.label)}</h2>
        {acaoDoTitulo}
      </div>
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
        {/* Sem o "Ver tudo em X" no fim da coluna (decisão do Peterson,
            09/10/2026, seguindo o protótipo): a coluna JÁ é o inventário do
            grupo, e o link repetia a mesma lista numa tela de cartões. A rota do
            hub continua existindo; só o atalho no fim da coluna saiu. */}
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
          {item.etiqueta && (
            // O `.nav2-tag` do protótipo: rótulo do catálogo, não permissão.
            <span className="ml-auto shrink-0 rounded-md border border-border-strong px-1.5 text-[11px] font-bold leading-[18px] text-text-subtle">
              {t(item.etiqueta)}
            </span>
          )}
          {item.healthDot && <ConnectionHealthDot className="ml-auto" />}
          {item.contador === "casos" && <ContadorDeCasos compacto={false} />}
          {item.contador === "fila" && <ContadorDaFila compacto={false} />}
          {item.contador === "avisos" && <ContadorDeAvisos />}
        </Link>
      </li>
      {children}
    </>
  );
}

/**
 * A seção tem a tela "Funis" (`/app/kanban`)? Função declarada, e não uma seta
 * dentro do componente: a cerca `vocabulario-do-funil` lê texto entre `>` e
 * `<`, e a seta seguida da rota parecia texto de tela.
 */
function temOQuadroDeFunis(secoes: Secao[]): boolean {
  return secoes.some(function (secao) {
    return secao.items.some(function (item) {
      return item.href === "/app/kanban";
    });
  });
}
