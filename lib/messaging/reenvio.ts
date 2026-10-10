/**
 * "Tentar de novo" numa mensagem enviada que FALHOU (B15 da auditoria do
 * visual v2).
 *
 * ─── O desenho: linha NOVA com vínculo, pela MESMA rota de envio ────────────
 *
 * O reenvio é um `POST /api/v1/messages` comum, com o mesmo conteúdo e
 * `reenvio_de: <id da que falhou>`. Passa por tudo que um envio passa (papel,
 * suporte, ritmo, cadeia `before_send`, auditoria). A linha que falhou NÃO é
 * reaproveitada: `status` de mensagem é escrito pelo motor e pelo webhook do
 * provedor (ack, `failed` com o motivo), e reabrir uma linha `failed` para
 * `queued` faria o histórico dizer que ela nunca falhou. A nova leva
 * `metadata.reenvio_de`, e a tela esconde o botão da que já foi reenviada.
 *
 * Mensagem de SAÍDA não acorda a IA: os gatilhos de `messages` que disparam o
 * agente olham `direction = 'inbound'`. Nada aqui grava entrada.
 *
 * ─── As recusas, aqui no servidor, e não só na tela ─────────────────────────
 *
 *   - a mensagem tem de existir NESTA organização e NESTA conversa;
 *   - tem de ser de saída e estar `failed`;
 *   - tem de ser do canal ATUAL da conversa (se a conversa mudou de número, o
 *     cliente receberia por outro número uma mensagem "repetida");
 *   - não pode já ter sido reenviada. O índice único
 *     `messages_reenvio_unico` (migration 9048) é a trava que vale contra dois
 *     cliques simultâneos; a consulta abaixo só dá a mensagem legível antes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export interface PedidoDeReenvio {
  organizationId: string;
  conversationId: string;
  /** O canal ATUAL da conversa, lido pelo handler de envio. */
  channelSessionId: string;
  reenvioDe: string;
  requestId: string;
  idioma?: Idioma;
}

export async function validarReenvio(supabase: SupabaseClient, p: PedidoDeReenvio): Promise<void> {
  const t = (texto: string) => traduzir(texto, p.idioma ?? "pt-BR");
  const { data: original, error } = await supabase
    .from("messages")
    .select("id, conversation_id, channel_session_id, direction, status")
    .eq("organization_id", p.organizationId)
    .eq("id", p.reenvioDe)
    .maybeSingle();
  if (error) throw new ApiError(500, "internal_error", undefined, p.requestId, error.message);
  const linha = original as {
    conversation_id: string;
    channel_session_id: string;
    direction: string;
    status: string;
  } | null;
  if (!linha || linha.conversation_id !== p.conversationId) {
    throw new ApiError(404, "not_found", undefined, p.requestId, t("A mensagem a reenviar não existe nesta conversa."));
  }
  if (linha.direction !== "outbound" || linha.status !== "failed") {
    throw new ApiError(409, "conflict", undefined, p.requestId, t("Só uma mensagem enviada que falhou pode ser reenviada."));
  }
  if (linha.channel_session_id !== p.channelSessionId) {
    throw new ApiError(
      409,
      "conflict",
      undefined,
      p.requestId,
      t("A conversa mudou de número desde o envio. Escreva uma mensagem nova."),
    );
  }
  const { data: jaReenviada, error: erroDaConsulta } = await supabase
    .from("messages")
    .select("id")
    .eq("organization_id", p.organizationId)
    .eq("conversation_id", p.conversationId)
    .eq("metadata->>reenvio_de", p.reenvioDe)
    .limit(1);
  if (erroDaConsulta) throw new ApiError(500, "internal_error", undefined, p.requestId, erroDaConsulta.message);
  if ((jaReenviada ?? []).length > 0) throw jaFoiReenviada(p.requestId, p.idioma);
}

/** A recusa de reenvio repetido: a da consulta e a do índice único (23505). */
export function jaFoiReenviada(requestId: string, idioma?: Idioma): ApiError {
  return new ApiError(
    409,
    "already_retried",
    undefined,
    requestId,
    traduzir("Esta mensagem já foi reenviada.", idioma ?? "pt-BR"),
  );
}
