import type { InboxFiltersValue } from "../InboxFilters";
import type { TipoDeCanal } from "@/lib/inbox/tipo-de-canal";
import { ROTULO_DO_PERIODO, SEM_RESPONSAVEL, type EscolhaDoAtendimento } from "@/lib/inbox/filtros-do-atendimento";

import type { ChipDeFiltro } from "./ChipsDeFiltro";

/** Nome de produto: igual em todo idioma. */
export const ROTULO_DO_TIPO: Record<TipoDeCanal, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

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
  nomes,
}: {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
  t: (texto: string) => string;
  nomeDoCanal: string;
  etiquetas: string[];
  alternaEtiqueta: (tag: string) => void;
  /** Nomes de funil, etapa e atendente por id (9051); sem nome, o chip diz o genérico. */
  nomes: { funil: (id: string) => string | undefined; etapa: (id: string) => string | undefined; membro: (id: string) => string | undefined };
}): ChipDeFiltro[] {
  const at = value.atendimento ?? {};
  const comAtendimento = (parcial: Partial<EscolhaDoAtendimento>) =>
    onChange({ ...value, atendimento: { ...at, ...parcial } });
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
    ...(value.canal
      ? [{ id: "tipo-de-canal", rotulo: ROTULO_DO_TIPO[value.canal], onRemover: () => onChange({ ...value, canal: undefined }) }]
      : []),
    ...(at.funil
      ? [{
          id: "funil",
          rotulo: nomes.funil(at.funil) ?? t("Funil"),
          onRemover: () => comAtendimento({ funil: undefined, etapas: undefined }),
        }]
      : []),
    ...(at.funil ? (at.etapas ?? []) : []).map((etapa) => ({
      id: `etapa:${etapa}`,
      rotulo: nomes.etapa(etapa) ?? t("Etapa"),
      onRemover: () => comAtendimento({ etapas: (at.etapas ?? []).filter((e) => e !== etapa) }),
    })),
    ...(at.responsavel
      ? [{
          id: "responsavel",
          rotulo:
            at.responsavel === SEM_RESPONSAVEL
              ? t("Sem responsável")
              : (nomes.membro(at.responsavel) ?? t("Responsável")),
          onRemover: () => comAtendimento({ responsavel: undefined }),
        }]
      : []),
    ...(at.periodo
      ? [{ id: "periodo", rotulo: t(ROTULO_DO_PERIODO[at.periodo]), onRemover: () => comAtendimento({ periodo: undefined }) }]
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
