/**
 * A preferência de FIXAR a 2ª coluna do menu (quadro DS, "Navegação em 2
 * colunas"): na Inbox ela começa recolhida e só fica ao lado se o atendente
 * fixar; nas outras telas vale a escolha de sempre (aberta por padrão).
 *
 * Guardada POR ATENDENTE: o cookie leva o id do usuário no nome, então duas
 * pessoas no mesmo navegador não herdam a escolha uma da outra. Não existe
 * tabela de preferências do usuário no banco; por isso a escolha não acompanha
 * a pessoa entre aparelhos. Cookie, e não localStorage, porque o servidor
 * precisa dela para desenhar a barra sem piscar.
 */
export type EscopoDoMenu = "geral" | "inbox";

/** O nome do cookie da preferência; o id é uuid (letras, dígitos e hífen). */
export function cookieDoMenu(escopo: EscopoDoMenu, usuarioId: string): string {
  const id = usuarioId.replace(/[^a-zA-Z0-9-]/g, "");
  return escopo === "inbox" ? `nav_fixa_inbox_${id}` : `sidebar_collapsed_${id}`;
}

/** A cookie antiga, de antes da preferência por atendente; vale até a pessoa mexer. */
export const COOKIE_LEGADO_DO_MENU = "sidebar_collapsed";

export function ehRotaDaInbox(pathname: string | null | undefined): boolean {
  return pathname === "/app/inbox" || !!pathname?.startsWith("/app/inbox/");
}

/**
 * A barra fica recolhida? Na Inbox, recolhida a menos que o atendente tenha
 * fixado; fora dela, a escolha geral. Abaixo de 1024px ela nunca fixa (quem
 * decide isso é o chamador, que conhece a largura da janela).
 */
export function menuRecolhido(f: { pathname: string | null; recolhidoGeral: boolean; fixoNaInbox: boolean }): boolean {
  return ehRotaDaInbox(f.pathname) ? !f.fixoNaInbox : f.recolhidoGeral;
}
