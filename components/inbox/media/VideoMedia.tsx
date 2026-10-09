"use client";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc } from "./media-utils";
import { useAoAparecer } from "./useAoAparecer";
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
  // Sem `src` até chegar perto da tela: o vídeo não pede rede antes disso.
  const { ref, visivel } = useAoAparecer<HTMLDivElement>();

  return (
    <div ref={ref} className="relative w-72 max-w-full aspect-video overflow-hidden rounded-xl bg-text/5">
      {failed ? (
        <MediaUnavailable kind="Vídeo" className="h-full w-full" />
      ) : (
        <>
          {!ready && <Skeleton className="absolute inset-0 h-full w-full" />}
          <video
            src={visivel ? fonte : undefined}
            controls
            preload={visivel ? "metadata" : "none"}
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
