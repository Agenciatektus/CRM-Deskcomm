/**
 * O nó "Pipeline" do menu — o único item do sidebar que ABRE em vez de navegar.
 *
 * ─── POR QUE ISTO EXISTE, E POR QUE NUM ARQUIVO SÓ DELE ─────────────────────
 *
 * O menu do CRM lista destinos fixos: cada um tem `href`, e `sidebarGroups()`
 * decide quais aparecem. Funciona para tela — não funciona para uma lista que
 * nasce do banco e muda por organização.
 *
 * Os funis são isso. A rota do quadro é `/app/pipelines/[id]`, e `[id]` é uma
 * linha de `crm_pipelines`: não existe `/app/pipelines` sozinha para um destino
 * fixo apontar. Medido em produção: quatro funis, um por organização — mas o
 * produto permite mais de um, e a tela de Funis existe justamente para criá-los.
 *
 * O arquivo é novo, e isso é decisão e não acaso. A política de fork do próprio
 * projeto é "customização só em arquivo novo", e o `catalogo.ts` é do upstream —
 * toda linha nossa lá conflita em cada merge. Este arquivo nunca conflita, e o
 * `catalogo.ts` volta a ficar **mais perto** do upstream do que estava: a
 * divergência que havia nele (o `sidebar: true` em "Etapas do funil") sai junto
 * com esta mudança, porque era a tentativa anterior de resolver este mesmo
 * pedido, e resolvia a tela errada.
 *
 * ─── A TELA ERRADA, POR ESCRITO ─────────────────────────────────────────────
 *
 * Em 17/09 o pedido foi "o pipeline no menu", e eu pus
 * `/app/settings/tenant/pipelines` — que é onde se CONFIGURA o funil: colunas,
 * vocabulário, motivos de perda. O Peterson queria `/app/pipelines/<id>`, que é
 * onde se TRABALHA: o quadro com os clientes dentro. As duas telas falam de
 * funil, e só o verbo as separa — o mesmo par de nomes que o comentário do
 * `catalogo.ts` já tinha desambiguado uma vez, e que eu confundi mesmo assim.
 */

/** Um funil, do jeito que o menu precisa dele: nome e para onde ir. */
export interface FunilDoMenu {
  id: string;
  name: string;
}

/**
 * O rótulo do nó pai. Fica aqui, e não no dicionário de i18n, porque o
 * dicionário é do upstream e acumula 367 commits dele — palavra nossa ali é
 * conflito garantido em todo merge, para ganhar nada.
 *
 * "Pipeline" no singular é escolha do Peterson, que opera a instalação. O menu
 * já tem "Funis" para a lista; este nó é o atalho para o quadro de cada um, e
 * ter os dois é o ponto: de "Funis" se administra, daqui se entra direto.
 */
export const ROTULO_DO_NO_DE_FUNIS = "Pipeline";

/** Para onde vai o quadro de um funil. Um lugar só monta esta URL. */
export function hrefDoFunil(id: string): string {
  return `/app/pipelines/${encodeURIComponent(id)}`;
}

/**
 * O nó aparece? Só quando há funil.
 *
 * Organização recém-criada não tem nenhum, e um expansor que abre vazio é pior
 * que a ausência dele: promete conteúdo e entrega um buraco. Quem ainda não tem
 * funil chega neles por "Funis", que é a tela que ensina a criar o primeiro.
 */
export function mostrarNoDeFunis(funis: readonly FunilDoMenu[]): boolean {
  return funis.length > 0;
}

/**
 * O nó está aberto quando se está DENTRO de um funil.
 *
 * Sem isto, entrar num quadro pelo ⌘K fecharia o ramo que contém a tela aberta,
 * e o menu diria que você está noutro lugar. A regra é a mesma que o sidebar já
 * usa para marcar item ativo — só que aplicada ao pai.
 */
export function noDeFunisAtivo(pathname: string): boolean {
  return pathname === "/app/pipelines" || pathname.startsWith("/app/pipelines/");
}
