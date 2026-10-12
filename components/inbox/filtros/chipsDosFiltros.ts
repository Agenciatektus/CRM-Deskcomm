import type { InboxFiltersValue } from "../InboxFilters";
import type { ChipDeFiltro } from "./ChipsDeFiltro";

/**
 * Os chips que nomeiam o que o popover de filtros ligou, cada um com o seu "x".
 * Saiu do `InboxFilters` sem mudar nada (o arquivo passaria de 300 linhas com a
 * forma do celular, M2.1).
 */
export function chipsDosFiltros({
  value,
  onChange,
  t,
  nomeDoCanal,
  etiquetas,
  alternaEtiqueta,
}: {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
  t: (texto: string) => string;
  nomeDoCanal: string;
  etiquetas: string[];
  alternaEtiqueta: (tag: string) => void;
}): ChipDeFiltro[] {
  return [
    ...(value.onlyUnread
      ? [{ id: "nao-lidas", rotulo: t("Só não lidas"), onRemover: () => onChange({ ...value, onlyUnread: false }) }]
      : []),
    ...(value.semPasso
      ? [{ id: "sem-passo", rotulo: t("Sem próximo passo"), onRemover: () => onChange({ ...value, semPasso: false }) }]
      : []),
    ...(value.onlyGroups
      ? [{ id: "grupos", rotulo: t("Só grupos"), onRemover: () => onChange({ ...value, onlyGroups: false }) }]
      : []),
    ...(value.channel_session_id != null
      ? [{ id: "canal", rotulo: nomeDoCanal, onRemover: () => onChange({ ...value, channel_session_id: undefined }) }]
      : []),
    ...etiquetas.map((tag) => ({ id: `tag:${tag}`, rotulo: tag, onRemover: () => alternaEtiqueta(tag) })),
    ...(value.entrada != null
      ? [{
          id: "entrada",
          rotulo: value.entrada === "comentario" ? t("Só comentários") : t("Só Direct"),
          onRemover: () => onChange({ ...value, entrada: undefined }),
        }]
      : []),
  ];
}
