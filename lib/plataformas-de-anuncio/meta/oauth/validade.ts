/**
 * Quanto falta para o token de longa duração da Meta vencer. Puro, para a tela
 * não pôr relógio dentro de componente.
 */

/** Avisar a partir de quantos dias antes do vencimento. */
export const DIAS_DE_AVISO_DE_VENCIMENTO = 10;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias inteiros até o vencimento (arredondado para cima); negativo ou zero =
 * vencido. `null` quando não há validade conhecida (token colado à mão).
 */
export function diasParaVencer(expiraEm: string | null, agora: Date = new Date()): number | null {
  if (!expiraEm) return null;
  const ms = new Date(expiraEm).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil((ms - agora.getTime()) / DIA_MS);
}
