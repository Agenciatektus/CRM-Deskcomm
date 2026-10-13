"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { roleAtLeast } from "@/lib/auth/types";
import type { Message } from "@/lib/types/messaging";

/** Os tipos que se reenviam com o que a linha guarda (texto e mídia). */
const TIPOS_REENVIAVEIS = new Set(["text", "image", "video", "audio", "document"]);

/**
 * "Tentar de novo" no fio (B15): quem pode, quais já foram reenviadas e o gesto.
 *
 * Reenviar é um envio comum pela MESMA rota (`useSendMessage` →
 * `POST /api/v1/messages`) com `reenvio_de`; o servidor confere conversa, canal,
 * `failed` e duplicidade (`lib/messaging/reenvio.ts`). "Já reenviada" sai do
 * próprio fio carregado: a linha nova leva `metadata.reenvio_de`. O gesto tem
 * identidade estável para não quebrar o `memo` das bolhas.
 */
export function useReenvioDoFio(conversationId: string | null, messages: Message[]) {
  // Os mesmos ganchos que o fio já usa (`ChatThread`): papel da org ativa e o
  // modo de suporte de quem está logado.
  const activeOrg = useActiveOrg();
  const user = useUser();
  const pode = roleAtLeast(activeOrg?.role, "agent") && user.support?.access_mode !== "support_readonly";
  const enviar = useSendMessage();
  const enviarRef = useRef(enviar);
  // Num efeito, e não no render: escrever em ref durante a renderização é
  // proibido pela regra `react-hooks/refs`.
  useEffect(() => {
    enviarRef.current = enviar;
  });

  const reenviadas = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages) {
      const origem = (m.metadata as Record<string, unknown> | null)?.reenvio_de;
      if (typeof origem === "string") ids.add(origem);
    }
    return ids;
  }, [messages]);

  const reenviar = useCallback(
    (m: Message) => {
      if (!conversationId) return;
      enviarRef.current.mutate({
        conversation_id: conversationId,
        type: m.type,
        ...(m.body ? { body: m.body } : {}),
        ...(m.media_storage_path ? { media_storage_path: m.media_storage_path } : {}),
        ...(!m.media_storage_path && m.media_url ? { media_url: m.media_url } : {}),
        ...(m.media_mime ? { media_mime: m.media_mime } : {}),
        ...(m.media_size_bytes ? { media_size_bytes: m.media_size_bytes } : {}),
        ...(m.reply_to_message_id ? { reply_to_message_id: m.reply_to_message_id } : {}),
        reenvio_de: m.id,
      });
    },
    [conversationId],
  );

  /** A bolha oferece o botão? Saída, falhou, tipo reenviável e ainda não reenviada. */
  const oferece = useCallback(
    (m: Message) =>
      pode &&
      m.direction === "outbound" &&
      m.status === "failed" &&
      TIPOS_REENVIAVEIS.has(m.type) &&
      !m.id.startsWith("temp-") &&
      !reenviadas.has(m.id),
    [pode, reenviadas],
  );

  return { oferece, reenviar, enviando: enviar.isPending };
}
