/**
 * Como se RECONHECE um aviso de etapa, sem o dicionário inteiro.
 *
 * Este pedaço roda no navegador (o som da Central, `lib/notifications/sons-da-org.ts`)
 * em toda tela, e o dicionário de idiomas pesa ~270 KB gzip. O reconhecimento
 * só precisa do começo do título em cada idioma servido, então ele mora aqui,
 * literal. `tests/unit/sons-dos-avisos.test.ts` confere que cada começo é
 * exatamente o que `traduzir` dá para a chave: as pontas não divergem.
 *
 * `Record<Idioma, string>`: idioma promovido em `lib/i18n/registro.ts` exige a
 * linha nova aqui, e o compilador aponta.
 */
import { IDIOMAS, type Idioma } from "@/lib/i18n/idiomas";

/** A chave do dicionário do começo do título. */
export const INICIO_DO_TITULO = "Negócio entrou em";

export const INICIO_DO_TITULO_POR_IDIOMA: Readonly<Record<Idioma, string>> = {
  "pt-BR": INICIO_DO_TITULO,
  es: "Negocio entró en",
};

/**
 * É o aviso de etapa? Pelo KIND, pela REFERÊNCIA e pelo COMEÇO do título.
 *
 * ⚠️ `kind = 'other'` com `ref_kind = 'lead'` NÃO basta, e a primeira versão
 * desta regra caía exatamente aí: o espelho de etapa que o assistente não
 * conseguiu gravar (`abreAvisoDoEspelhoRecusado`, em
 * `lib/agent-engine/edge/crm/move-lead-stage.ts`) também nasce `other`
 * apontando para um negócio, e um defeito de funil tocaria o som de "entrou
 * na etapa". O aviso não tem coluna de origem; o título, montado por
 * `tituloDoAvisoDeEtapa`, é a marca. Confere em TODO idioma servido: a
 * organização pode ter mudado de idioma depois de o aviso nascer.
 */
export function ehAvisoDeEtapa(aviso: {
  kind: string;
  ref_kind: string | null;
  title?: string | null;
}): boolean {
  if (aviso.kind !== "other" || aviso.ref_kind !== "lead") return false;
  const titulo = aviso.title ?? "";
  return IDIOMAS.some((idioma) => titulo.startsWith(`${INICIO_DO_TITULO_POR_IDIOMA[idioma]} «`));
}
