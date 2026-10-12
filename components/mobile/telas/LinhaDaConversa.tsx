/**
 * A linha da conversa NO CELULAR (o `.cv` do protótipo): avatar de 52px, nome de 16px
 * e prévia de 14,5px, com mais respiro. É a MESMA linha da Inbox (`ConversationListItem`,
 * com os mesmos dados, ícones, contador e gesto de deslizar): estas classes só valem
 * abaixo de 760px (`mb:`), então o desktop fica igual. Um lugar só para as medidas
 * do protótipo (`tests/unit/paridade-mobile.test.ts` confere que os tokens estão aqui).
 */
export const LINHA_DA_CONVERSA_NO_CELULAR = {
  /** A grade: coluna do avatar com a largura dele, e mais respiro dos lados. */
  grade: "mb:grid-cols-[var(--mb-avatar-lista)_minmax(0,1fr)] mb:px-4 mb:py-2.5",
  avatar: "mb:size-(--mb-avatar-lista)",
  avatarTexto: "mb:size-(--mb-avatar-lista) mb:text-base",
  nome: "mb:text-(length:--mb-linha-nome)",
  previa: "mb:text-(length:--mb-linha-previa)",
} as const;
