/**
 * Prefixo das buscas recentes do celular no `localStorage`. A busca pode conter
 * nome ou telefone de contato, então a chave separa pessoa E organização, e o
 * "Sair" apaga todas as deste aparelho (`esquecerBuscasRecentes`).
 */
export const PREFIXO_BUSCAS_RECENTES = "crm-buscas-recentes:";

export function esquecerBuscasRecentes(): void {
  try {
    const chaves = Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIXO_BUSCAS_RECENTES));
    for (const k of chaves) window.localStorage.removeItem(k);
  } catch {
    // Armazenamento bloqueado: não há o que apagar.
  }
}
