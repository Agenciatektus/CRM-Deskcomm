"use client";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc } from "./media-utils";
import { useFonteComReserva } from "./useFonteComReserva";

/**
 * Vídeo inline com controles nativos (padrão WhatsApp Web).
 *
 * `src` é a fonte alternativa para mídia de NOTA interna (#1863, F3), que a
 * rota da nota serve; sem ele, o caminho de mensagem de sempre.
 */
export function VideoMedia({
  messageId,
  src,
  srcReserva,
}: {
  messageId: string;
  src?: string;
  srcReserva?: string;
}) {
  const [ready, setReady] = useState(false);
  const { fonte, tentarReserva } = useFonteComReserva(src ?? mediaSrc(messageId), srcReserva);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative w-full max-w-sm aspect-video overflow-hidden rounded-lg bg-black/5">
      {failed ? (
        <MediaUnavailable kind="Vídeo" className="h-full w-full" />
      ) : (
        <>
          {!ready && <Skeleton className="absolute inset-0 h-full w-full" />}
          <video
            src={fonte}
            controls
            preload="metadata"
            onLoadedMetadata={() => setReady(true)}
            onError={() => {
              if (!tentarReserva()) setFailed(true);
            }}
            className="h-full w-full object-contain"
          />
        </>
      )}
    </div>
  );
}
