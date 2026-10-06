/**
 * O TOM da pílula de espera na lista de conversas.
 *
 * Não havia régua de cor para a espera: a pílula "Aguardando há…" era sempre
 * cinza, e o olho precisava LER cada linha da Fila para achar quem estava
 * esperando demais. A cor faz a triagem antes da leitura.
 *
 * Os limiares (10 e 30 minutos) são os do protótipo do visual v2. Ficam numa
 * função pura, separada do componente, para que mudar o limiar seja mudar UM
 * lugar, com teste, e não caçar `>= 30` espalhado em JSX.
 *
 * `null` (sem desde quando) vira `info`: sem dado não se afirma urgência.
 */
export type TomDaEspera = "info" | "warn" | "crit";

export const LIMIAR_ATENCAO_MIN = 10;
export const LIMIAR_CRITICO_MIN = 30;

export function tomDaEspera(desde: string | null, agora: Date = new Date()): TomDaEspera {
  if (!desde) return "info";
  const minutos = (agora.getTime() - new Date(desde).getTime()) / 60_000;
  if (!Number.isFinite(minutos)) return "info";
  if (minutos >= LIMIAR_CRITICO_MIN) return "crit";
  if (minutos >= LIMIAR_ATENCAO_MIN) return "warn";
  return "info";
}

/** Classes de token por tom. Só tokens do tema: nada de cor fixa. */
export const CLASSE_DO_TOM: Record<TomDaEspera, string> = {
  info: "bg-info-bg text-info-fg",
  warn: "bg-warning-bg text-warning-fg",
  crit: "bg-error-bg text-error-fg",
};
