/**
 * Quais contas de anúncio uma organização pode ver — UMA regra, usada por todas
 * as rotas e telas.
 *
 * Um login OAuth pessoal alcança as contas de vários clientes; sem esta lista, o
 * gestor de um cliente leria campanhas de outro. Retorna `null` = sem restrição
 * (token colado à mão pelo próprio cliente), ou a lista (possivelmente vazia).
 */
const ID_DE_CONTA = /^act_\d+$/;

/** `123`, `act_123` ou ` ACT_123 ` viram `act_123`; o resto vira `null`. */
export function normalizarContaId(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const s = bruto.trim().toLowerCase();
  const id = /^\d+$/.test(s) ? `act_${s}` : s;
  return ID_DE_CONTA.test(id) ? id : null;
}

export function normalizarContas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  for (const x of lista) {
    const id = normalizarContaId(x);
    if (id) vistos.add(id);
  }
  return [...vistos];
}

export function contasPermitidas(c: {
  via: string | null;
  allowed: unknown;
  padrao: string | null;
}): string[] | null {
  if (Array.isArray(c.allowed)) return normalizarContas(c.allowed);
  if (c.via === "oauth") {
    const padrao = normalizarContaId(c.padrao);
    return padrao ? [padrao] : [];
  }
  return null;
}

/** `null` = sem restrição. Qualquer outra coisa que não lista nega (falha fechada). */
export function contaPermitida(permitidas: string[] | null, conta: string): boolean {
  if (permitidas === null) return true;
  if (!Array.isArray(permitidas)) return false;
  const id = normalizarContaId(conta);
  return id !== null && permitidas.includes(id);
}
