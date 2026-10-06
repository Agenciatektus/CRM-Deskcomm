import { NAV_CATALOG, NAV_GROUPS, type NavGroupId, type NavMetadata } from "./catalogo";
import { noDeFunisAtivo } from "./funis-no-menu";

/**
 * Onde a pessoa está, dito pelo REGISTRO de navegação e não por uma lista nova.
 *
 * Dois leitores pedem a mesma resposta: a barra de duas colunas (qual grupo
 * abrir) e a trilha do cabeçalho ("Grupo › Página"). Se cada um casasse a rota
 * do seu jeito, um dia a barra diria CRM e a trilha diria Organização para a
 * mesma tela, e as duas pareceriam certas sozinhas.
 *
 * Função pura, sem permissão: a rota atual é a que a pessoa já abriu. Quem
 * decide o que ela pode VER continua sendo `sidebarGroups()`/`hubSections()`.
 */

/** A rota é o próprio `href` ou uma tela abaixo dele. Prefixo solto não conta. */
export function rotaCasa(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * O destino do registro que contém a rota, pelo `href` MAIS LONGO que casa.
 *
 * Mais longo porque os destinos se aninham: `/app/ai/evolution` mora em Análise
 * e começa com `/app/ai`, que é o hub de IA; `/app/settings/tenant/pipelines` é
 * do CRM e mora abaixo de `/app/settings`. O primeiro que casasse erraria o
 * grupo justamente nas telas que a reorganização por objetivo moveu de lugar.
 */
export function destinoDaRota(pathname: string): NavMetadata | null {
  let melhor: NavMetadata | null = null;
  for (const d of NAV_CATALOG as readonly NavMetadata[]) {
    if (rotaCasa(pathname, d.href) && (!melhor || d.href.length > melhor.href.length)) melhor = d;
  }
  return melhor;
}

/**
 * O grupo da rota: o do destino, senão o do HUB que a contém, senão CRM para o
 * quadro de um funil (`/app/pipelines/<id>` não é destino fixo, ver
 * `funis-no-menu.ts`). `null` quando nada casa (ex.: `/app/onboarding`).
 *
 * Destino e hub disputam pelo mesmo critério do mais longo: `/app/ai` (hub de
 * IA) perde para `/app/ai/evolution` (Análise), e ganha de qualquer tela de IA
 * que não esteja no registro.
 */
export function grupoDaRota(pathname: string): NavGroupId | null {
  let melhor: { href: string; group: NavGroupId } | null = null;
  const candidatos = [
    ...(NAV_CATALOG as readonly NavMetadata[]).map((d) => ({ href: d.href, group: d.group })),
    ...NAV_GROUPS.flatMap((g) => (g.hub ? [{ href: g.hub.href, group: g.id }] : [])),
  ];
  for (const c of candidatos) {
    if (rotaCasa(pathname, c.href) && (!melhor || c.href.length > melhor.href.length)) melhor = c;
  }
  if (melhor) return melhor.group;
  return noDeFunisAtivo(pathname) ? "crm" : null;
}
