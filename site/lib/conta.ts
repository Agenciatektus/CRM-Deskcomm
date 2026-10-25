/**
 * Contas da calculadora da LP. Funções puras: recebem números, devolvem números ou `null`. Nenhum
 * valor padrão, nenhuma estimativa nossa e nenhum envio de dado; a conta usa só o que a pessoa informa.
 * Os preços são os do plano, os mesmos de `conteudo.ts` (R$ 397 com IA, R$ 157 sem IA, R$ 1.297 de implantação).
 */

export const PLANO_COM_IA = 397;
export const PLANO_SEM_IA = 157;
export const IMPLANTACAO = 1297;

export type Plano = "com-ia" | "sem-ia";

/** Tetos por campo: acima disso o número é quase certamente erro de digitação. */
export const LIMITES = {
  atendentes: 1_000,
  custoPorAtendente: 1_000_000,
  custoIA: 1_000_000,
  conversas: 10_000_000,
  ticket: 100_000_000,
} as const;

export type Campo = keyof typeof LIMITES;
export type Leitura =
  | { estado: "vazio" }
  | { estado: "erro"; motivo: "invalido" | "negativo" | "muito-alto" | "fracionado" }
  | { estado: "ok"; valor: number };

const FORMATO_PT_BR = /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/;

/** Lê o texto de um campo. Aceita só o formato pt-BR (milhar com ponto, centavos com vírgula); rejeita NaN, Infinity, negativos e valores acima do teto. */
export function lerCampo(texto: string, max: number, inteiro = false): Leitura {
  const t = texto.trim();
  if (t === "") return { estado: "vazio" };
  if (/^-\s*\d/.test(t)) return { estado: "erro", motivo: "negativo" };
  // Só o formato pt-BR: ponto separa milhar, vírgula separa centavos. "2.80", "0x10" e "1e3" são inválidos.
  if (!FORMATO_PT_BR.test(t)) return { estado: "erro", motivo: "invalido" };
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return { estado: "erro", motivo: "invalido" };
  if (n > max) return { estado: "erro", motivo: "muito-alto" };
  if (inteiro && !Number.isInteger(n)) return { estado: "erro", motivo: "fracionado" };
  return { estado: "ok", valor: n };
}

function valido(n: number, max: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
}

/** Custo mensal de hoje: N atendentes x custo de cada um. */
export function custoHoje(atendentes: number, custo: number): number | null {
  if (!valido(atendentes, LIMITES.atendentes) || !valido(custo, LIMITES.custoPorAtendente)) return null;
  return atendentes * custo;
}

/** Mensalidade: plano com IA já inclui a IA (a IA própria é ignorada); plano sem IA soma a IA que a empresa paga. */
export function mensalidade(plano: Plano, custoIA: number): number | null {
  if (plano === "com-ia") return PLANO_COM_IA;
  if (!valido(custoIA, LIMITES.custoIA)) return null;
  return PLANO_SEM_IA + custoIA;
}

/** Custo mensal com IA: S pessoas na supervisão x custo de cada uma + mensalidade (e IA própria no plano sem IA). */
export function custoComIA(supervisao: number, custo: number, plano: Plano, custoIA: number): number | null {
  if (!valido(supervisao, LIMITES.atendentes) || !valido(custo, LIMITES.custoPorAtendente)) return null;
  const m = mensalidade(plano, custoIA);
  return m === null ? null : supervisao * custo + m;
}

/** Meses para a economia cobrir a implantação opcional; só existe quando a economia mensal é positiva. */
export function mesesParaPagarImplantacao(economiaMes: number): number | null {
  if (!Number.isFinite(economiaMes) || economiaMes <= 0) return null;
  return Math.ceil(IMPLANTACAO / economiaMes);
}

export type EntradaTime = {
  atendentes: number;
  custoPorAtendente: number;
  supervisao: number;
  plano: Plano;
  /** Custo mensal de IA que a empresa paga por fora; só vale no plano sem IA. */
  custoIA: number;
};

export type ResultadoTime = {
  hoje: number;
  comIA: number;
  economiaMes: number;
  economiaAno: number;
  mesesParaPagar: number | null;
};

/** Comparação completa. Devolve `null` se alguma entrada for inválida ou a supervisão passar do time atual. */
export function calculaTime(e: EntradaTime): ResultadoTime | null {
  if (!Number.isInteger(e.atendentes) || !Number.isInteger(e.supervisao)) return null;
  if (e.atendentes < 1 || e.supervisao > e.atendentes) return null;
  const hoje = custoHoje(e.atendentes, e.custoPorAtendente);
  const comIA = custoComIA(e.supervisao, e.custoPorAtendente, e.plano, e.custoIA);
  if (hoje === null || comIA === null) return null;
  const economiaMes = hoje - comIA;
  return {
    hoje,
    comIA,
    economiaMes,
    economiaAno: economiaMes * 12,
    mesesParaPagar: mesesParaPagarImplantacao(economiaMes),
  };
}

/** A conta do vácuo: conversas x fatia sem resposta (em %) x ticket médio. */
export function perdaDoVacuo(conversas: number, fatiaPct: number, ticket: number): number | null {
  if (!valido(conversas, LIMITES.conversas) || !valido(ticket, LIMITES.ticket)) return null;
  if (!valido(fatiaPct, 100)) return null;
  const total = conversas * (fatiaPct / 100) * ticket;
  return Number.isFinite(total) ? total : null;
}
