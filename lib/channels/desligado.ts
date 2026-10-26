import { interpretaWahaHabilitado } from "@/lib/waha/habilitado";

/**
 * Provider conhecido que esta instalação DESLIGOU de propósito (interruptor do
 * ambiente). Cron e vigia pulam a linha em silêncio: não é falha, não há o que
 * alertar a cada rodada. Lê o ambiente a cada chamada.
 */
export function canalDesligadoNaInstalacao(provider: string | null | undefined): boolean {
  return (provider ?? "waha") === "waha" && !interpretaWahaHabilitado(process.env.WAHA_HABILITADO);
}
