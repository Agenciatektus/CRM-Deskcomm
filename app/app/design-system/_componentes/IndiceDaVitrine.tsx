"use client";

import { useT } from "@/hooks/i18n/useT";

import type { Tema } from "./tema";

/**
 * O índice da vitrine, na ordem dos quadros DS. As âncoras levam ao painel do
 * `tema` (no lado a lado, o claro, que vem primeiro).
 */
export function IndiceDaVitrine({ tema }: { tema: Tema }) {
  const t = useT();
  const ir = (base: string) => `#ds-${base}-${tema}`;
  return (
    <nav
      aria-label={t("Seções do design system")}
      className="sticky top-0 z-20 -mx-6 border-y border-border bg-bg/95 px-6 py-2 backdrop-blur"
    >
      <ol className="scrollbar-none flex gap-1 overflow-x-auto text-label font-semibold text-text-muted">
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("cor")}>{t("Cor")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("tipo")}>{t("Tipografia")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("espaco")}>{t("Espaço")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("forma")}>{t("Forma")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("navegacao")}>{t("Navegação em 2 colunas")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("componentes")}>{t("Componentes básicos")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("mensagens")}>{t("Mensagens")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("lead")}>{t("Coluna do lead")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("tarefas")}>{t("Tarefas")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("menus")}>{t("Menus, avisos e busca")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("retorno")}>{t("Retorno e redimensionamento")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("layout")}>{t("Layout da Inbox")}</a></li>
        <li><a className="block whitespace-nowrap rounded-md px-2 py-1 hover:bg-hover hover:text-text" href={ir("regras")}>{t("Regras que aprendemos no protótipo")}</a></li>
      </ol>
    </nav>
  );
}
