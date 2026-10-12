"use client";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useOpcoesDeCriar } from "@/lib/mobile/useOpcoesDeCriar";
import { usePodeCriar } from "@/lib/mobile/usePodeCriar";
import { Plus } from "@/lib/ui/icons";

import { FolhaCriar } from "./telas/FolhaCriar";

/**
 * O botão flutuante "+" (o `.fab` do protótipo): 60px, raio 20, acima da barra
 * inferior e da área segura. Abre a folha "Criar" com as opções da tela
 * (`opcoesDeCriar`). Quem não pode criar (viewer, suporte somente leitura) não vê o
 * botão (`usePodeCriar`, a régua do servidor).
 */
export function BotaoCriar() {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  const opcoes = useOpcoesDeCriar();
  const podeCriar = usePodeCriar();
  if (opcoes.length === 0 || !podeCriar) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label={t("Criar")}
        className="pele-foco pele-grad-contador fixed right-(--mb-fab-margem) bottom-[calc(var(--mb-fab-acima)+var(--mb-area-baixo))] z-30 hidden size-(--mb-fab) place-items-center rounded-(--mb-fab-raio) bg-accent text-accent-foreground shadow-pop mb:grid"
      >
        <Plus size={26} weight="bold" aria-hidden />
      </button>
      <FolhaCriar aberta={aberta} aoMudar={setAberta} />
    </>
  );
}
