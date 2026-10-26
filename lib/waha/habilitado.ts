/**
 * Interruptor do WAHA (`WAHA_HABILITADO`). A regra mora em `lib/interruptor.ts`;
 * aqui só o nome da variável, para worker, cron e rotas.
 */
import { interpretaInterruptor, interruptorValido, mensagemInterruptorInvalido } from "@/lib/interruptor";

export const MENSAGEM_WAHA_HABILITADO_INVALIDO = mensagemInterruptorInvalido("WAHA_HABILITADO");
export const wahaHabilitadoValido = interruptorValido;

export function interpretaWahaHabilitado(valor: string | undefined): boolean {
  return interpretaInterruptor("WAHA_HABILITADO", valor);
}
