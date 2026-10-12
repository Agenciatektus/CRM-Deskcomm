/**
 * A preferência de FIXAR a 2ª coluna do menu (quadro DS, "Navegação em 2
 * colunas"): na Inbox ela começa recolhida e só fica ao lado se o atendente
 * fixar; nas outras telas vale a escolha de sempre (aberta por padrão).
 *
 * UM cookie por navegador (`menu_do_atendente`), com o id de quem gravou e as
 * duas escolhas: `<id do usuário>:<geral><inbox>`, em que `geral` é "1" para
 * recolhida e `inbox` é "1" para fixa. Quando outra pessoa mexe no mesmo
 * navegador, a preferência dela SOBRESCREVE a anterior; enquanto ela não mexe,
 * o cookie de outro id é ignorado e valem os padrões. Assim não se acumulam
 * cookies por atendente num computador compartilhado (P2-1 do Cassio na #169).
 *
 * Não existe tabela de preferências do usuário no banco; por isso a escolha não
 * acompanha a pessoa entre aparelhos. Cookie, e não localStorage, porque o
 * servidor precisa dela para desenhar a barra sem piscar.
 */
export type EscopoDoMenu = "geral" | "inbox";

export const COOKIE_DO_MENU = "menu_do_atendente";

/** A cookie antiga, de antes da preferência por atendente; vale até alguém mexer. */
export const COOKIE_LEGADO_DO_MENU = "sidebar_collapsed";

export type PreferenciaDoMenu = { recolhidoGeral: boolean; fixoNaInbox: boolean };

const limparId = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "");

/** Lê o cookie para ESTE usuário; de outro id (ou ausente), devolve `null`. */
export function lerPreferenciaDoMenu(valor: string | undefined, usuarioId: string): PreferenciaDoMenu | null {
  const m = /^([a-zA-Z0-9-]+):([01])([01])$/.exec(valor ?? "");
  if (!m || m[1] !== limparId(usuarioId)) return null;
  return { recolhidoGeral: m[2] === "1", fixoNaInbox: m[3] === "1" };
}

export function escreverPreferenciaDoMenu(usuarioId: string, p: PreferenciaDoMenu): string {
  return `${limparId(usuarioId)}:${p.recolhidoGeral ? "1" : "0"}${p.fixoNaInbox ? "1" : "0"}`;
}

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
