"use client";
import { useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Play } from "@/lib/ui/icons";

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
  const t = useT();
  const [ready, setReady] = useState(false);
  const [duracao, setDuracao] = useState<number | null>(null);
  const [iniciado, setIniciado] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { fonte, tentarReserva } = useFonteComReserva(src ?? mediaSrc(messageId), srcReserva);
  const [failed, setFailed] = useState(false);
  const { ref, visivel, carregar } = useAoAparecer<HTMLDivElement>();

  // O `.media` de vídeo do quadro DS: o quadro parado com o play redondo no
  // meio e a duração no canto. Os controles nativos só aparecem depois do play.
  const tocar = () => {
    setIniciado(true);
    if (!visivel) carregar();
    const el = videoRef.current;
    if (el) void Promise.resolve(el.play()).catch(() => undefined);
  };

  return (
    <div ref={ref} className="relative w-60 max-w-full aspect-video overflow-hidden rounded-[14px] bg-text/5">
      {failed ? (
        <MediaUnavailable kind="Vídeo" className="h-full w-full" />
      ) : (
        <>
          {!ready && <Skeleton className="absolute inset-0 h-full w-full" />}
          <video
            ref={videoRef}
            src={visivel ? fonte : undefined}
            controls={iniciado}
            autoPlay={iniciado}
            preload={visivel ? "metadata" : "none"}
            onLoadedMetadata={(e) => {
              setReady(true);
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuracao(d);
            }}
            onError={() => {
              if (!tentarReserva()) setFailed(true);
            }}
            className="h-full w-full object-contain"
          />
          {!iniciado && (
            <>
              <button
                type="button"
                onClick={tocar}
                aria-label={t("Reproduzir vídeo")}
                className="absolute left-1/2 top-1/2 grid size-13.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[oklch(0.15_0.01_260/0.55)] text-white backdrop-blur-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Play size={22} weight="fill" aria-hidden className="ml-0.75" />
              </button>
              {duracao != null && (
                <span className="absolute left-2.5 top-2.5 rounded-lg bg-[oklch(0.15_0.01_260/0.6)] px-1.75 py-0.75 text-[11.5px] font-bold tabular-nums text-white">
                  {Math.floor(duracao / 60)}:{String(Math.floor(duracao % 60)).padStart(2, "0")}
                </span>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
