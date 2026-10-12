/**
 * A tabela que vira lista empilhada no celular SÓ por CSS (o tratamento "Empilhada"
 * do catálogo mobile), para as tabelas com controles na linha (papel, ações, caixas):
 * uma árvore só, sem duplicar botão nem rótulo acessível como faria o
 * `TabelaOuCartoes`. Abaixo de 760px o cabeçalho some, cada linha vira um bloco com
 * respiro de 16px e a primeira célula (o nome) ocupa a linha inteira. Célula com
 * `data-rotulo` mostra o rótulo antes do valor (o que o cabeçalho dizia). No
 * desktop, nada muda. Aplicar no `className` da `<Table>`.
 */
export const TABELA_EMPILHADA = [
  "mb:block",
  "mb:[&_thead]:hidden",
  "mb:[&_tbody]:block",
  "mb:[&_tr]:flex mb:[&_tr]:flex-wrap mb:[&_tr]:items-center mb:[&_tr]:gap-x-3 mb:[&_tr]:gap-y-1.5 mb:[&_tr]:px-4 mb:[&_tr]:py-3",
  "mb:[&_td]:p-0 mb:[&_td:empty]:hidden",
  "mb:[&_td[data-rotulo]]:before:mr-1 mb:[&_td[data-rotulo]]:before:text-text-subtle mb:[&_td[data-rotulo]]:before:content-[attr(data-rotulo)]",
  "mb:[&_td:first-child]:basis-full mb:[&_td:first-child]:text-(length:--mb-linha-nome) mb:[&_td:first-child]:font-semibold",
].join(" ");
