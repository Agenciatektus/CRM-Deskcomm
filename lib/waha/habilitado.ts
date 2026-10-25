/**
 * Interruptor do WAHA (`WAHA_HABILITADO`), puro e sem o parse do env do app: o
 * worker e o cron também precisam perguntar, e nenhum dos dois pode puxar o Zod
 * inteiro do app. `lib/env.ts` reexporta isto como `wahaHabilitado()`.
 */
export function interpretaWahaHabilitado(valor: string | undefined): boolean {
  return !["false", "0", "no"].includes((valor ?? "true").trim().toLowerCase());
}
