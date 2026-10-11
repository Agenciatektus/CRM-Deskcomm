"use client";

import { useEffect, useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";

import { PainelDoTema } from "./PainelDoTema";
import type { ModoDaVitrine } from "./tema";

/**
 * A vitrine do design system: os componentes REAIS do CRM, em um tema ou nos
 * dois lado a lado, com o que difere do protótipo marcado.
 *
 * ── Por que ela mexe no `data-theme` do <html> enquanto está aberta ─────────
 *
 * Os utilitários `dark:` e as classes `pele-*` casam com QUALQUER ancestral
 * `[data-theme="dark"]`. Uma subárvore clara dentro de página escura herda os
 * tokens claros (o espelho do `globals.css`) mas continua casando esses
 * seletores, e o botão primário apareceria com o degradê do escuro no painel
 * claro. Então: no modo de um tema, o <html> recebe esse tema e o painel não
 * leva atributo (fiel em tudo, inclusive na marca da organização e nas
 * camadas que abrem no <body>); no lado a lado, o <html> fica claro e só o
 * painel escuro é subárvore `data-theme="dark"`. Ao sair, o atributo volta ao
 * que era. A preferência gravada da pessoa não é tocada.
 */
export function VitrineDoDesignSystem() {
  const t = useT();
  const [modo, setModo] = useState<ModoDaVitrine>("lado");

  useEffect(() => {
    const html = document.documentElement;
    const antes = html.getAttribute("data-theme");
    html.setAttribute("data-theme", modo === "escuro" ? "dark" : "light");
    return () => {
      if (antes) html.setAttribute("data-theme", antes);
      else html.removeAttribute("data-theme");
    };
  }, [modo]);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-3xl flex-col gap-1">
            <h1 className="text-title-lg font-bold tracking-tight">{t("Design System")}</h1>
            <p className="text-ui text-text-muted">
              {t("Os componentes reais do CRM com os tokens de hoje. O selo marca o que ainda difere do protótipo da Inbox v2; o mapa completo está em docs/design/design-system/mapa-de-tokens.md.")}
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

        {modo === "lado" ? (
          <>
            <p className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-label text-text-muted">
              {t("No lado a lado, o que abre por cima da página (diálogo, menu, popover, dica e aviso) aparece no tema claro, porque nasce no fim da página e não dentro do painel. Para ver essas camadas no escuro, use o modo Escuro.")}
            </p>
            <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
              <PainelDoTema key="lado-claro" tema="claro" />
              <PainelDoTema key="lado-escuro" tema="escuro" subarvore />
            </div>
          </>
        ) : (
          <PainelDoTema key={modo} tema={modo} />
        )}
      </div>
    </TooltipProvider>
  );
}
