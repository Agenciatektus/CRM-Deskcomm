/**
 * Os TIPOS de canal que a Inbox filtra (a folha de filtros do celular, M2.2): a lista
 * FIXA do CHECK `conversations_channel_check`. A lista e a contagem filtram pela
 * coluna da própria conversa (`conversations.channel`), então o valor nunca vira
 * consulta em sessão de outra organização. Valor fora desta lista é recusado (422).
 */
export const TIPOS_DE_CANAL = ["whatsapp", "instagram", "facebook"] as const;
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number];

export function ehTipoDeCanal(valor: unknown): valor is TipoDeCanal {
  return typeof valor === "string" && (TIPOS_DE_CANAL as readonly string[]).includes(valor);
}
