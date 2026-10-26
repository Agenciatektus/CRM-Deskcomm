/**
 * Interruptor liga/desliga lido de uma variável de ambiente, puro e sem o parse
 * do env do app (o worker e o cron também perguntam). Vive fora das pastas de
 * transporte de propósito: `lib/env.ts` o importa, e quase todo módulo importa
 * `lib/env.ts`.
 *
 * Não falha aberto: ausente = ligado; true/1/yes/on e false/0/no/off valem; QUALQUER
 * outro valor é recusado no boot (Zod, via `interruptorValido`) e, onde o boot não
 * passou por aí, lido como DESLIGADO com um aviso, uma vez por variável.
 */
const LIGADO = ["true", "1", "yes", "on"];
const DESLIGADO = ["false", "0", "no", "off"];
const avisados = new Set<string>();

export function interruptorValido(valor: string | undefined): boolean {
  if (valor === undefined) return true;
  const v = valor.trim().toLowerCase();
  return LIGADO.includes(v) || DESLIGADO.includes(v);
}

export function mensagemInterruptorInvalido(nome: string): string {
  return `${nome} inválido: use true/false/1/0/yes/no/on/off, ou apague a variável (padrão: ligado).`;
}

export function interpretaInterruptor(nome: string, valor: string | undefined): boolean {
  if (valor === undefined) return true;
  const v = valor.trim().toLowerCase();
  if (LIGADO.includes(v)) return true;
  if (DESLIGADO.includes(v)) return false;
  if (!avisados.has(nome)) {
    avisados.add(nome);
    console.warn(`[interruptor] ${mensagemInterruptorInvalido(nome)} Valor recebido tratado como DESLIGADO.`);
  }
  return false;
}
