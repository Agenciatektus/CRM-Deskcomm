/**
 * QUANTO o Sentry amostra — num ponto só, para os três runtimes.
 *
 * Antes: `tracesSampleRate: 1` (todo request e toda navegação viravam trace) e
 * `replaysSessionSampleRate: 0.1` no browser (uma em cada dez sessões gravada
 * inteira, mesmo sem erro nenhum). Os dois custam CPU e rede do usuário e cota
 * do Sentry, e o que se usa de fato é o replay QUE EXPLICA UM ERRO.
 *
 * Agora: replay só em erro (o `replayIntegration` segue ligado, em modo buffer,
 * e só envia quando há erro) e 10% de traces, ajustável sem rebuild por
 * `SENTRY_TRACES_SAMPLE_RATE`. No Sentry da comunidade, trace é sempre 0
 * (issue #100), como já era.
 */
export const TAXA_DE_TRACES_PADRAO = 0.1;

export function taxaDeTraces(valor: string | undefined | null, comunidade: boolean): number {
  if (comunidade) return 0;
  const texto = (valor ?? "").trim();
  if (!texto) return TAXA_DE_TRACES_PADRAO;
  const n = Number(texto);
  // Valor fora de 0..1 é engano de configuração: cai no padrão em vez de, por
  // exemplo, "10" virar 100% de traces.
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : TAXA_DE_TRACES_PADRAO;
}

/** Replay: nenhuma sessão gravada "por amostra"; toda sessão com erro, sim. */
export const AMOSTRAGEM_DE_REPLAY = {
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
} as const;
