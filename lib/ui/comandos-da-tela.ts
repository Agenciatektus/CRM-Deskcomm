/**
 * Pedidos que a busca (Ctrl K) faz a peças que ela não monta: abrir o popover
 * do sino e abrir o "Próximo passo" da conversa aberta.
 *
 * A paleta mora no topo e o sino e o painel do lead moram em outras árvores
 * (o painel nem existe fora da Inbox). Um evento na `window`, com nome tipado
 * aqui, liga as duas pontas sem um provider novo em volta do app inteiro: quem
 * pode atender o pedido escuta; se ninguém escuta, o pedido não faz nada, o
 * que é o certo (a paleta só oferece a ação quando a peça está na tela).
 */
export type ComandoDaTela =
  | "abrir-avisos"
  /** Para a Inbox: garante o painel do lead à vista e repassa ao painel. */
  | "proximo-passo"
  /** Para o painel do lead, já montado: rola até o "Próximo passo". */
  | "painel-proximo-passo"
  /** Para a Inbox aberta: liga o filtro "Sem próximo passo". */
  | "so-sem-passo";

const PREFIXO = "crm:";

export function pedir(comando: ComandoDaTela): void {
  window.dispatchEvent(new Event(PREFIXO + comando));
}

/** Escuta um pedido; devolve a função que para de escutar (para o `useEffect`). */
export function escutar(comando: ComandoDaTela, aoPedir: () => void): () => void {
  const nome = PREFIXO + comando;
  window.addEventListener(nome, aoPedir);
  return () => window.removeEventListener(nome, aoPedir);
}
