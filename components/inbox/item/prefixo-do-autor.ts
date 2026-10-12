import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * O prefixo da prévia (L14 da auditoria; o `.prev-who` do protótipo). Vem do
 * campo calculado `autor_da_ultima_mensagem` (migration 9047), pedido na mesma
 * consulta da lista. Mensagem do cliente não leva prefixo, e linha sem o campo
 * (cache antigo, evento do realtime) também não: melhor sem prefixo que errado.
 */
export function prefixoDoAutor(
  autor: ConversationWithContact["autor_da_ultima_mensagem"],
  t: (texto: string) => string,
): string | null {
  if (autor === "equipe") return t("Você:");
  if (autor === "ia") return t("IA:");
  if (autor === "automacao") return t("Automação:");
  return null;
}
