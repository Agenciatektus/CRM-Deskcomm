"use client";

import { useMemo, useState } from "react";

import { useContactTagVocabulary } from "@/hooks/contacts/useContactTagVocabulary";
import { useConversationTagVocabulary } from "@/hooks/inbox/useConversationTags";
import { marcadoresEscolhidos } from "@/lib/inbox/marcador-da-conversa";

/**
 * As opções do filtro de etiqueta e as escolhidas, com a memória que impede o
 * seletor de sumir debaixo do menu aberto.
 *
 * Saiu de `InboxFilters.tsx` (que passou de 600 linhas) e fica num HOOK, e não
 * dentro do popover de filtros, de propósito: o popover desmonta ao fechar, e a
 * lembrança do último vocabulário tem de sobreviver a isso. Quem chama é a barra
 * de filtros, que fica montada o tempo todo.
 */
export function useOpcoesDeEtiqueta(orgId: string | null, tag: string | readonly string[] | undefined) {
  /**
   * As opções são a UNIÃO das duas caixas, as mesmas que o filtro consulta
   * (`conversations.tags` ou `contacts.tags`, no handler da lista). Quem oferece
   * e quem filtra lendo fontes diferentes é o defeito espelhado: ou a opção
   * existe e devolve vazio, ou o marcador que funciona nunca é oferecido.
   */
  const { data: tagsDeConversa } = useConversationTagVocabulary(orgId);
  const { data: tagsDeContato } = useContactTagVocabulary(orgId);
  const tagVocabulary = useMemo(
    () =>
      tagsDeConversa == null && tagsDeContato == null
        ? undefined
        : [...new Set([...(tagsDeConversa ?? []), ...(tagsDeContato ?? [])])].sort((a, b) =>
            a.localeCompare(b),
          ),
    [tagsDeConversa, tagsDeContato],
  );
  // A lista escolhida, normalizada pelo MESMO caminho do servidor
  // (`marcadoresEscolhidos`): sem vazio, sem repetido, na ordem da primeira
  // aparição. Duas fontes para "quantas estão escolhidas" fariam a tela mostrar
  // um filtro e a lista aplicar outro.
  const etiquetas = useMemo(
    () => marcadoresEscolhidos(typeof tag === "string" ? [tag] : (tag ?? [])),
    [tag],
  );

  /**
   * O SELETOR NÃO PODE SUMIR DEBAIXO DO MENU ABERTO.
   *
   * A existência do seletor lê duas queries em voo, as duas com `orgId` na chave.
   * Um único render em que o vocabulário volte a indefinido ou vazio DESMONTAVA o
   * controle, e o menu que o operador tinha acabado de abrir fechava sozinho
   * (o `filtro-por-marcador-pela-tela.spec.ts` intermitente). Por isso vale o
   * último vocabulário NÃO-VAZIO que esta tela conheceu.
   *
   * Medido em `tests/unit/inbox-filtro-de-tag-nao-desmonta.test.tsx`.
   */
  const [ultimoVocabulario, setUltimoVocabulario] = useState<string[]>([]);
  if (tagVocabulary != null && tagVocabulary.length > 0 && tagVocabulary !== ultimoVocabulario) {
    // Ajuste de estado DURANTE o render ("adjusting state when props change"):
    // o React refaz o render com o valor novo antes de pintar. Efeito aqui não
    // serviria, porque roda DEPOIS da pintura, e a janela de um frame é
    // exatamente a que desmonta o seletor.
    setUltimoVocabulario(tagVocabulary);
  }
  const vocabularioDoSeletor =
    tagVocabulary != null && tagVocabulary.length > 0 ? tagVocabulary : ultimoVocabulario;
  // "Conhecido" e "não-vazio" são coisas diferentes, e é o primeiro que vale
  // aqui: a organização cuja ÚLTIMA etiqueta acabou de ser apagada responde
  // vocabulário vazio, e é ela que precisa do seletor para desfazer o filtro.
  const vocabularioConhecido = tagVocabulary != null || ultimoVocabulario.length > 0;
  // A validação do filtro órfão é sobre a LISTA (#1274): basta UMA das
  // escolhidas ter sumido do vocabulário para o operador precisar da válvula.
  // Ternário que devolve SEMPRE lista, porque `&&` daria `false | string[]`.
  const etiquetasForaDoVocabulario =
    etiquetas.length > 0 && vocabularioConhecido
      ? etiquetas.filter((t) => !vocabularioDoSeletor.includes(t))
      : [];
  const mostrarSeletorDeTag =
    vocabularioDoSeletor.length > 0 || etiquetasForaDoVocabulario.length > 0;
  // As órfãs entram nas opções: sem elas o gatilho resumiria um filtro cujas
  // opções não estão mais lá, e o operador não teria como tirá-las.
  const opcoesDoSeletor = [...vocabularioDoSeletor, ...etiquetasForaDoVocabulario];

  return { etiquetas, opcoesDoSeletor, mostrarSeletorDeTag };
}
