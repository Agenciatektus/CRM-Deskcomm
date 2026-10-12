"use client";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { MagnifyingGlass } from "@/lib/ui/icons";

import { Busca } from "./telas/Busca";

/**
 * O campo de busca do topo da lista no celular (o `.sf` do protótipo): 44px, raio 14,
 * texto de 16px. É um botão com cara de campo: abre a busca geral (contatos, conversas
 * e leads) em tela cheia (`telas/Busca`), com os resultados do Ctrl K e sem o atalho.
 */
export function CampoDeBusca() {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="pele-foco mx-4 mt-1 mb-2 flex h-(--mb-busca-altura) w-[calc(100%-2rem)] items-center gap-2.5 rounded-(--mb-busca-raio) bg-surface-elevated px-3.5 text-left text-(length:--mb-campo-fonte) text-text-subtle shadow-[inset_0_0_0_1px_var(--color-border)]"
      >
        <MagnifyingGlass size={18} aria-hidden />
        <span className="truncate">{t("Buscar contato, conversa ou lead")}</span>
      </button>
      <Busca aberta={aberta} aoMudar={setAberta} verTodasNaLista />
    </>
  );
}
