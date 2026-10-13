"use client";

import { chipVariants } from "@/components/ui/chip";

import { SeletorDeDataHora } from "@/components/ui/seletor-de-data-hora";

/**
 * O chip dos atalhos ("O que fazer" e "Quando"), nas medidas do `.chip` do
 * protótipo: 32px de altura, 13px semibold e borda forte. Com 28px/12px os
 * atalhos pareciam etiqueta, não botão, e o alvo de toque ficava abaixo do que
 * se acerta com o polegar no celular.
 */
export const CLASSES_DO_CHIP = chipVariants();
export const CLASSES_DO_CHIP_LIGADO = "pele-grad border-accent bg-accent text-accent-foreground hover:border-accent hover:text-accent-foreground";

/**
 * "Quando": o seletor do quadro DS inteiro, à vista — atalhos de dia (Hoje,
 * Amanhã, o próximo dia útil, Em 7 dias), calendário, horários em chips e
 * "Outro horário". Antes eram três atalhos de dia e hora prontos e o calendário
 * atrás de "Escolher data"; o quadro põe o dia e o horário como duas escolhas.
 */
export function QuandoFazer({ onEscolher, rotulo }: {
  onEscolher: (prazo: Date | null) => void;
  /** O id do rótulo visível que nomeia o seletor. */
  rotulo: string;
}) {
  return (
    <div aria-labelledby={rotulo} role="group">
      <SeletorDeDataHora valor={null} onEscolher={onEscolher} />
    </div>
  );
}
