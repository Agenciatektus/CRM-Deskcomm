/**
 * Interruptor do WAHA (`WAHA_HABILITADO`), puro e sem o parse do env do app: o
 * worker e o cron também precisam perguntar, e nenhum dos dois pode puxar o Zod
 * inteiro do app. `lib/env.ts` reexporta isto como `wahaHabilitado()`.
 *
 * Não falha aberto: ausente = ligado (o padrão de sempre); true/1/yes/on e
 * false/0/no/off valem; QUALQUER outro valor (`flase`, `desligado`, vazio) é
 * recusado no boot pelo Zod (`wahaHabilitadoValido`) e, onde o boot não passou
 * por aí, é lido como DESLIGADO com um aviso, uma vez. Um typo no .env que
 * mantivesse o WAHA ligado seria o oposto do que quem digitou quis.
 */
const LIGADO = ["true", "1", "yes", "on"];
const DESLIGADO = ["false", "0", "no", "off"];

let avisou = false;

/** Para o Zod: `undefined` (ausente) ou um dos oito valores, sem diferenciar caixa. */
export function wahaHabilitadoValido(valor: string | undefined): boolean {
  if (valor === undefined) return true;
  const v = valor.trim().toLowerCase();
  return LIGADO.includes(v) || DESLIGADO.includes(v);
}

export const MENSAGEM_WAHA_HABILITADO_INVALIDO =
  "WAHA_HABILITADO inválido: use true/false/1/0/yes/no/on/off, ou apague a variável (padrão: ligado).";

export function interpretaWahaHabilitado(valor: string | undefined): boolean {
  if (valor === undefined) return true;
  const v = valor.trim().toLowerCase();
  if (LIGADO.includes(v)) return true;
  if (DESLIGADO.includes(v)) return false;
  if (!avisou) {
    avisou = true;
    console.warn(`[waha] ${MENSAGEM_WAHA_HABILITADO_INVALIDO} Valor recebido tratado como DESLIGADO.`);
  }
  return false;
}
