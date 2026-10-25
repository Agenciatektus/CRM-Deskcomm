/**
 * Quando avisar do vencimento do token da Meta. Puro, sem relógio nem rede.
 * Espelho de `alerta-credenciais` da Verdash: d7/d3/d1 antes de vencer (por
 * JANELA, não igualdade: um dia de cron perdido não apaga o aviso), depois de
 * vencido repete a cada 3 dias até 30 e a cada 7 daí em diante.
 */
const DIA_MS = 24 * 60 * 60 * 1000;
const MARCOS_ANTES = [1, 3, 7] as const;
const INTERVALO_APOS_VENCER = 3;
const DIAS_ATE_ESPACAR = 30;
const INTERVALO_ESPACADO = 7;

/** Dias inteiros até vencer (para cima); zero ou negativo = vencido. */
export function diasAteVencer(expiraEm: string, agora: Date): number {
  return Math.ceil((new Date(expiraEm).getTime() - agora.getTime()) / DIA_MS);
}

/** Marco devido hoje (`d7`, `d3`, `d1`, `x0`, `x3`...) ou `null`. */
export function marcoDoDia(diasRestantes: number): string | null {
  if (diasRestantes > 0) {
    for (const d of MARCOS_ANTES) if (diasRestantes <= d) return `d${d}`;
    return null;
  }
  const vencido = Math.abs(diasRestantes);
  const intervalo = vencido >= DIAS_ATE_ESPACAR ? INTERVALO_ESPACADO : INTERVALO_APOS_VENCER;
  return `x${Math.floor(vencido / intervalo) * intervalo}`;
}

export interface ConexaoParaAlertar {
  token_expires_at: string | null;
  needs_reconnect: boolean;
  needs_reconnect_desde: string | null;
}

export interface Pendencia {
  marco: string;
  /** Identifica o ciclo: o mesmo marco de outro vencimento avisa de novo. */
  janela: string;
  /** Negativo ou zero = já fora do ar. */
  diasRestantes: number;
  /** A Meta recusou renovar (e não só venceu pelo relógio). */
  recusada: boolean;
}

/** O que avisar desta conexão hoje, ou `null`. Recusa da Meta vale mais que a data. */
export function pendenciaDaConexao(c: ConexaoParaAlertar, agora: Date): Pendencia | null {
  if (c.needs_reconnect) {
    const desde = c.needs_reconnect_desde ?? c.token_expires_at ?? agora.toISOString();
    const dias = -Math.floor((agora.getTime() - new Date(desde).getTime()) / DIA_MS);
    const marco = marcoDoDia(Math.min(dias, 0));
    return marco
      ? { marco, janela: `recusa:${desde.slice(0, 10)}`, diasRestantes: Math.min(dias, 0), recusada: true }
      : null;
  }
  if (!c.token_expires_at) return null;
  const dias = diasAteVencer(c.token_expires_at, agora);
  const marco = marcoDoDia(dias);
  return marco
    ? { marco, janela: `vence:${c.token_expires_at.slice(0, 10)}`, diasRestantes: dias, recusada: false }
    : null;
}
