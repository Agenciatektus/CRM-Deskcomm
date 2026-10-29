/**
 * Quanto sugerir de estorno ao cancelar uma assinatura (decisão do dono, que pode
 * trocar o valor na tela). A regra segue o que o mercado de SaaS faz no Brasil:
 *  - até 7 dias da cobrança: tudo (direito de arrependimento, CDC art. 49);
 *  - depois, mensal: nada (o mês foi usado);
 *  - depois, anual: os meses inteiros que ainda não começaram, em proporção.
 * A taxa que a Stripe cobrou no pagamento original não volta com o estorno.
 */
export const DIAS_DE_ARREPENDIMENTO = 7;
const DIA_MS = 86_400_000;

export type RegraDoEstorno = "arrependimento" | "anual_proporcional" | "mensal_sem_estorno";

export interface CobrancaParaEstorno {
  valorCents: number;
  estornadoCents: number;
  pagaEm: Date;
}

export function sugerirEstorno(
  c: CobrancaParaEstorno,
  intervalo: "mes" | "ano",
  agora: Date = new Date(),
): { cents: number; regra: RegraDoEstorno } {
  const saldo = Math.max(0, c.valorCents - c.estornadoCents);
  const dias = Math.max(0, Math.floor((agora.getTime() - c.pagaEm.getTime()) / DIA_MS));
  if (dias <= DIAS_DE_ARREPENDIMENTO) return { cents: saldo, regra: "arrependimento" };
  if (intervalo === "mes") return { cents: 0, regra: "mensal_sem_estorno" };
  const mesesIniciados = Math.min(12, Math.ceil(dias / 30));
  const alvo = Math.floor((c.valorCents * (12 - mesesIniciados)) / 12);
  return { cents: Math.max(0, Math.min(saldo, alvo - c.estornadoCents)), regra: "anual_proporcional" };
}
