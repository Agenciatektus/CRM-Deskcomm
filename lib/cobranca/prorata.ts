/**
 * Calcula o ajuste de um upgrade pelo tempo restante do período já pago.
 * O período vem do provedor (em instantes), e o valor fica em centavos BRL.
 */
export function calcularAjusteProporcional(input: {
  precoAtualCents: number;
  precoNovoCents: number;
  periodoPagoDesde: Date | null;
  proximoVencimento: Date | null;
  agora: Date;
}): number | null {
  const { precoAtualCents, precoNovoCents, periodoPagoDesde, proximoVencimento, agora } = input;
  if (precoNovoCents <= precoAtualCents) return 0;
  if (!periodoPagoDesde || !proximoVencimento) return null;
  const inicio = periodoPagoDesde.getTime();
  const fim = proximoVencimento.getTime();
  const agoraMs = agora.getTime();
  if (![inicio, fim, agoraMs].every(Number.isFinite) || fim <= inicio || fim <= agoraMs) return 0;
  const restante = Math.min(1, Math.max(0, (fim - agoraMs) / (fim - inicio)));
  return Math.round((precoNovoCents - precoAtualCents) * restante);
}
