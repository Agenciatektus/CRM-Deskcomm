/**
 * Preços da oferta, em CENTAVOS (inteiros) para não acumular erro de ponto flutuante.
 * Mensal: R$ 397 com IA e R$ 157 sem IA. Anual: 12 mensalidades com 15% de desconto.
 * Implantação opcional: R$ 1.297 em até 3x sem juros.
 *
 * O plano anual é cobrado de uma vez (confirmado pelo Peterson em 26/10/2026); a tela e o FAQ dizem isso.
 * O checkout (Stripe) precisa cobrar o anual à vista, não parcelado no cartão.
 */

export type Plano = "com-ia" | "sem-ia";
export type Periodo = "mensal" | "anual";

export const MENSAL_CENTAVOS: Record<Plano, number> = { "com-ia": 39_700, "sem-ia": 15_700 };
export const IMPLANTACAO_CENTAVOS = 129_700;
export const PARCELAS_IMPLANTACAO = 3;
/** 15% de desconto no anual, em pontos inteiros para a conta ser exata. */
export const DESCONTO_ANUAL_PCT = 15;

/** Total do plano anual: 12 mensalidades menos o desconto, arredondado ao centavo. */
export function anualCentavos(plano: Plano): number {
  return Math.round((MENSAL_CENTAVOS[plano] * 12 * (100 - DESCONTO_ANUAL_PCT)) / 100);
}

/** Valor mensal equivalente do plano anual. */
export function equivalenteMensalCentavos(plano: Plano): number {
  return Math.round(anualCentavos(plano) / 12);
}

/** Cada parcela da implantação em 3x: R$ 432,33. */
export function parcelaImplantacaoCentavos(): number {
  return Math.round(IMPLANTACAO_CENTAVOS / PARCELAS_IMPLANTACAO);
}

/** No plano mensal com implantação, o que se paga por mês do 1º ao 3º mês: plano mais uma parcela. */
export function totalPrimeirosMesesCentavos(plano: Plano): number {
  return MENSAL_CENTAVOS[plano] + parcelaImplantacaoCentavos();
}

const BRL2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "R$ 397" quando é inteiro, "R$ 337,45" quando tem centavos. */
export function reaisDeCentavos(c: number): string {
  return (c % 100 === 0 ? BRL0 : BRL2).format(c / 100);
}

/** Mensagem do botão de assinatura no WhatsApp, com período e implantação quando escolhidos. */
export function mensagemDeAssinatura(plano: Plano, periodo: Periodo, comImplantacao: boolean): string {
  const nome = plano === "com-ia" ? "com IA" : "sem IA";
  const partes = [`Oi, quero assinar o Verdash CRM ${nome}`, periodo === "anual" ? "no plano anual" : "no plano mensal"];
  if (comImplantacao) partes.push("com implantação");
  return `${partes.join(", ")}.`;
}
