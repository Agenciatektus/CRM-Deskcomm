import { redirect } from "next/navigation";

/**
 * ETIQUETAS → TAGS (migration 9038).
 *
 * Decisão do Peterson em 05/10/2026: as duas telas de etiquetas viraram uma, a
 * de Tags. O que só esta tinha (acrescentar, promover, arquivar e desarquivar
 * sugestões de conversa e de contato) foi para lá; renomear, juntar e excluir
 * já existiam lá, e desde a 9038 mantêm também as listas de sugestão.
 *
 * O endereço continua respondendo para quem tem o link salvo ou a aba aberta,
 * e manda para a tela que ficou. A autorização é a de lá (manager+).
 */
export default function EtiquetasVirouTags(): never {
  redirect("/app/settings/tags");
}
