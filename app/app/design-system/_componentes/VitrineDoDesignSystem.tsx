"use client";

import { useEffect, useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";

import { IndiceDaVitrine } from "./IndiceDaVitrine";
import { PainelDoTema } from "./PainelDoTema";
import { ProvedorDaVitrine } from "./ProvedorDaVitrine";
import type { ModoDaVitrine } from "./tema";

/**
 * A vitrine do design system: os componentes REAIS do CRM, em um tema ou nos
 * dois lado a lado, com o que difere do protótipo marcado.
 *
 * ── Lado a lado: cada painel carrega o próprio `data-theme` ─────────────────
 *
 * A primeira versão deixava o painel claro sem atributo e forçava o <html> para
 * claro num efeito. No carregamento da página o `ThemeProvider` (ancestral)
 * roda o efeito DEPOIS do nosso e devolvia o escuro: o painel "claro" saía
 * escuro. Agora os dois painéis levam `data-theme`, o <html> não é tocado, e o
 * `globals.css` recorta o `dark:` e as classes `pele-*` para fora de uma
 * subárvore clara dentro da escura. A marca de cada tema chega pelo
 * `ESCOPO_DO_PAINEL` (ver page.tsx).
 *
 * ── Um tema só: o <html> recebe esse tema enquanto a vitrine está aberta ───
 *
 * Assim as camadas que abrem no <body> (diálogo, menu, toast) também ficam no
 * tema escolhido. A troca só acontece por clique, depois da montagem, então o
 * `ThemeProvider` não a desfaz. Ao sair, o atributo volta ao que era; a
 * preferência gravada da pessoa não é tocada.
 */
export function VitrineDoDesignSystem() {
  const t = useT();
  const [modo, setModo] = useState<ModoDaVitrine>("lado");

  useEffect(() => {
    if (modo === "lado") return;
    const html = document.documentElement;
    const antes = html.getAttribute("data-theme");
    html.setAttribute("data-theme", modo === "escuro" ? "dark" : "light");
    return () => {
      if (antes) html.setAttribute("data-theme", antes);
      else html.removeAttribute("data-theme");
    };
  }, [modo]);

  return (
    <ProvedorDaVitrine>
      <TooltipProvider>
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex max-w-3xl flex-col gap-1">
              <h1 className="text-title-lg font-bold tracking-tight">{t("Design System")}</h1>
              <p className="text-ui text-text-muted">
                {t(
                  "Os componentes reais do CRM com os tokens de hoje. O selo marca o que ainda difere do protótipo da Inbox v2; o mapa completo está em docs/design/design-system/mapa-de-tokens.md.",
                )}
              </p>
            </div>
            <Tabs value={modo} onValueChange={(v) => setModo(v as ModoDaVitrine)}>
              <TabsList aria-label={t("Tema da vitrine")}>
                <TabsTrigger value="claro">{t("Claro")}</TabsTrigger>
                <TabsTrigger value="escuro">{t("Escuro")}</TabsTrigger>
                <TabsTrigger value="lado">{t("Lado a lado")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </header>

          <p className="rounded-md border border-dashed border-border-strong px-3 py-2 text-label text-text-muted">
            {t(
              "Dados de exemplo. Nenhum nome, número ou conversa desta página vem do banco. Enquanto ela está aberta, nenhuma gravação sai do navegador, nem as do menu e do topo do app.",
            )}
          </p>
          <IndiceDaVitrine tema={modo === "escuro" ? "escuro" : "claro"} />

          {modo === "lado" ? (
            <>
              <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-label text-text-muted">
                {t(
                  "No lado a lado, o que abre por cima da página (diálogo, menu, popover, dica e aviso) aparece no tema do app, porque nasce no fim da página e não dentro do painel. Para ver essas camadas num tema, use o modo Claro ou Escuro.",
                )}
              </p>
              <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
                <PainelDoTema key="lado-claro" tema="claro" subarvore />
                <PainelDoTema key="lado-escuro" tema="escuro" subarvore />
              </div>
            </>
          ) : (
            <PainelDoTema key={modo} tema={modo} />
          )}
        </div>
      </TooltipProvider>
    </ProvedorDaVitrine>
  );
}
