"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import { ATALHOS_DE_QUANDO, atalhoDisponivel, prazoDoAtalho, type AtalhoDeQuando } from "./prazos";
import { SeletorDeDataHora } from "./SeletorDeDataHora";

const ROTULO_DO_ATALHO: Record<AtalhoDeQuando, string> = {
  hoje_18: "Hoje 18:00",
  amanha_9: "Amanhã 9:00",
  em_3_dias_9: "Em 3 dias 9:00",
};

type Escolha = AtalhoDeQuando | "escolher" | null;

/**
 * O chip dos atalhos ("O que fazer" e "Quando"), nas medidas do `.chip` do
 * protótipo: 32px de altura, 13px semibold e borda forte. Com 28px/12px os
 * atalhos pareciam etiqueta, não botão, e o alvo de toque ficava abaixo do que
 * se acerta com o polegar no celular.
 */
export const CLASSES_DO_CHIP =
  "h-8 rounded-full border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text-muted hover:border-text-subtle hover:text-text disabled:cursor-not-allowed disabled:opacity-40";
export const CLASSES_DO_CHIP_LIGADO = "border-accent bg-accent text-accent-foreground hover:border-accent hover:text-accent-foreground";

/**
 * "Quando": três atalhos e a saída para o calendário.
 *
 * Os atalhos são os prazos que quem atende usa de verdade (fim do dia, amanhã
 * cedo, daqui a uns dias). O calendário fica atrás de "Escolher data" para a
 * fileira caber na coluna e o caso comum custar um clique.
 */
export function QuandoFazer({ onEscolher, rotulo }: {
  onEscolher: (prazo: Date | null) => void;
  /** O id do rótulo visível que nomeia o grupo de atalhos. */
  rotulo: string;
}) {
  const t = useT();
  const [escolha, setEscolha] = useState<Escolha>(null);
  const agora = new Date();

  function escolher(proxima: Escolha) {
    setEscolha(proxima);
    if (proxima === null || proxima === "escolher") onEscolher(null);
    else onEscolher(prazoDoAtalho(proxima));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={rotulo}>
        {ATALHOS_DE_QUANDO.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={escolha === a}
            disabled={!atalhoDisponivel(a, agora)}
            onClick={() => escolher(escolha === a ? null : a)}
            className={cn(CLASSES_DO_CHIP, escolha === a && CLASSES_DO_CHIP_LIGADO)}
          >
            {t(ROTULO_DO_ATALHO[a])}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={escolha === "escolher"}
          aria-expanded={escolha === "escolher"}
          onClick={() => escolher(escolha === "escolher" ? null : "escolher")}
          className={cn(CLASSES_DO_CHIP, escolha === "escolher" && CLASSES_DO_CHIP_LIGADO)}
        >
          {t("Escolher data")}
        </button>
      </div>
      {escolha === "escolher" && <SeletorDeDataHora valor={null} onEscolher={onEscolher} />}
    </div>
  );
}
