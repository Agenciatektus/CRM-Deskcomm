/**
 * "O CRM deste contato mudou fora do painel": um aviso de navegador, sem estado.
 *
 * O painel do lead (`useResumoDoContato`) não usa react-query, então um
 * `invalidateQueries` vindo de outra peça da tela não o alcança. Quem grava no
 * negócio por FORA do painel (o menu de contexto da lista, trocando etapa ou
 * funil) avisa aqui; o painel relê se estiver mostrando ESTE contato e ignora
 * o aviso de qualquer outro. Nenhuma das duas peças importa a outra.
 */
const EVENTO = "inbox:crm-do-contato-mudou";

export function avisarQueOCrmDoContatoMudou(contactId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(EVENTO, { detail: contactId }));
}

/** Assina o aviso; devolve a função que cancela a assinatura. */
export function ouvirMudancaNoCrmDoContato(aoMudar: (contactId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const ouvinte = (e: Event) => {
    const id = (e as CustomEvent<unknown>).detail;
    if (typeof id === "string") aoMudar(id);
  };
  window.addEventListener(EVENTO, ouvinte);
  return () => window.removeEventListener(EVENTO, ouvinte);
}
