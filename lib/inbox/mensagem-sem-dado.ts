import type { Message } from "@/lib/types/messaging";

/**
 * Mensagem que não carrega dado nenhum: sem texto, sem mídia e com `metadata`
 * vazio (nenhuma chave). É ruído de protocolo do WhatsApp (sincronização entre
 * aparelhos, edição, apagada) gravado antes da correção em
 * `lib/channels/verdash/conteudo.ts`. Fica no banco, mas não é desenhada no
 * histórico nem vira prévia.
 *
 * Qualquer dado mantém a mensagem visível: `tipo_nao_suportado`, localização,
 * contato, reação e anexos moram no `metadata`; `revoked_at` é o "apagada"
 * real, que a tela mostra.
 */
export function mensagemSemDado(
  m: Pick<Message, "body" | "media_url" | "media_storage_path" | "metadata" | "revoked_at">,
): boolean {
  if (m.body?.trim()) return false;
  if (m.media_url || m.media_storage_path) return false;
  if (m.revoked_at) return false;
  return !m.metadata || Object.keys(m.metadata).length === 0;
}
