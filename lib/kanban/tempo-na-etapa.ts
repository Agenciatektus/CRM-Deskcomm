/**
 * O tempo na etapa, no rodapé do card: neutro até o limite da etapa, âmbar
 * ("Parado há X dias") depois dele, vermelho no dobro.
 *
 * O limite é `crm_stages.expected_duration_hours` — a MESMA coluna que o radar
 * usa para a janela de esfriamento (`lib/leads/risk-radar.ts`). Etapa sem
 * limite fica neutra, a não ser que o radar já tenha classificado o negócio
 * como esfriando (`isCooling`, janela padrão): aí é âmbar, para o card não
 * discordar do radar.
 */
export type NivelDoTempo = "neutro" | "alerta" | "critico";

export interface TempoNaEtapa {
  nivel: NivelDoTempo;
  /** Dias inteiros; abaixo de um dia, as horas. */
  dias: number;
  horas: number;
}

export function tempoNaEtapa(
  horasNaEtapa: number | null,
  limiteEmHoras: number | null | undefined,
  esfriando = false,
): TempoNaEtapa | null {
  if (horasNaEtapa == null) return null;
  const horas = Math.max(0, Math.floor(horasNaEtapa));
  const dias = Math.floor(horas / 24);
  const limite = typeof limiteEmHoras === "number" && limiteEmHoras > 0 ? limiteEmHoras : null;
  let nivel: NivelDoTempo = "neutro";
  if (limite !== null && horas > 2 * limite) nivel = "critico";
  else if ((limite !== null && horas > limite) || esfriando) nivel = "alerta";
  return { nivel, dias, horas };
}

/** O texto: "há 3 dias", "há 5h", "agora" — ou "Parado há 6 dias" fora do limite. */
export function rotuloDoTempo(
  tempo: TempoNaEtapa,
  t: (texto: string) => string = (texto) => texto,
): string {
  const quanto =
    tempo.dias >= 1
      ? `${tempo.dias} ${tempo.dias === 1 ? t("dia") : t("dias")}`
      : tempo.horas >= 1
        ? `${tempo.horas}h`
        : null;
  // Chave com lacuna, e não "há" + quanto: a ordem é da língua (o inglês põe o
  // marcador depois, "3 days ago"), e pedaço solto prende a ordem do português.
  if (tempo.nivel !== "neutro") return quanto ? t("Parado há {tempo}").replace("{tempo}", quanto) : t("Parado");
  return quanto ? t("há {tempo}").replace("{tempo}", quanto) : t("agora");
}
