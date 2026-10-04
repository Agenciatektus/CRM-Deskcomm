"use client";
import { useT } from "@/hooks/i18n/useT";
import type { Message } from "@/lib/types/messaging";

import { AudioPlayer } from "./AudioPlayer";
import { DocumentCard } from "./DocumentCard";
import { ImageMedia } from "./ImageMedia";
import { StickerMedia } from "./StickerMedia";
import { VideoMedia } from "./VideoMedia";

/**
 * Dispatcher de mídia por message.type (Onda 1). Tipo com mídia mas sem
 * renderer dedicado (location/contact futuros) cai no DocumentCard —
 * sempre dá pro atendente baixar o arquivo.
 */
export function MediaRenderer({ message }: { message: Message }) {
  const t = useT();
  const isOutbound = message.direction === "outbound";
  // A URL assinada que a lista entregou em lote: sem ela, cada mídia faria a
  // própria ida a /messages/{id}/media ao montar. O documento continua na rota:
  // ele só baixa no clique, que pode vir horas depois, com a URL já vencida.
  const src = message.media_signed_url ?? undefined;
  switch (message.type) {
    case "image":
      return <ImageMedia messageId={message.id} alt={t("Imagem recebida")} src={src} />;
    case "sticker":
      return <StickerMedia messageId={message.id} src={src} />;
    case "audio":
      return <AudioPlayer messageId={message.id} isOutbound={isOutbound} src={src} />;
    case "video":
      return <VideoMedia messageId={message.id} src={src} />;
    case "contact":
      return null;
    default:
      return (
        <DocumentCard
          messageId={message.id}
          mime={message.media_mime}
          sizeBytes={message.media_size_bytes}
          storagePath={message.media_storage_path}
          isOutbound={isOutbound}
        />
      );
  }
}
