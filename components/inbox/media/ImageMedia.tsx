"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc } from "./media-utils";
import { useFonteComReserva } from "./useFonteComReserva";

interface Props {
  messageId: string;
  alt: string;
  /**
   * Fonte alternativa: a mídia da NOTA interna (#1863, F3) é servida pela rota
   * da nota, não pela de mensagem — `messageId` não existe lá. Quando ausente,
   * o caminho é o de sempre (`/api/v1/messages/{id}/media`).
   */
  src?: string;
  /** Para onde ir se `src` falhar (a URL assinada venceu): ver `useFonteComReserva`. */
  srcReserva?: string;
  /**
   * Miniatura (migration 9033): o que a BOLHA mostra. O clique abre `src`, a
   * original. Sem miniatura, a bolha mostra a original, como antes.
   */
  srcMiniatura?: string;
}

/** Miniatura na bolha + lightbox (Dialog) no clique. Padrão WhatsApp Web. */
export function ImageMedia({ messageId, alt, src: fonte, srcReserva, srcMiniatura }: Props) {
  const t = useT();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false);
  const original = fonte ?? mediaSrc(messageId);
  // A bolha usa a miniatura; se ela falhar (vencida, apagada), cai na rota, que
  // serve a original — a mesma reserva de sempre.
  const { fonte: src, tentarReserva } = useFonteComReserva(srcMiniatura ?? original, srcReserva);

  if (state === "error")
    return (
      <div className="w-64 max-w-full aspect-[4/3]">
        <MediaUnavailable kind="Imagem" className="h-full w-full" />
      </div>
    );

  return (
    <>
      <button
        type="button"
        aria-label={t("Ampliar imagem")}
        onClick={() => setOpen(true)}
        disabled={state !== "ready"}
        aria-disabled={state !== "ready"}
        className={cn(
          "relative block w-64 max-w-full aspect-[4/3] overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-ring",
          state === "ready" ? "cursor-zoom-in" : "cursor-not-allowed opacity-50",
        )}
      >
        {state === "loading" && <Skeleton className="absolute inset-0 h-full w-full" />}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setState("ready")}
          onError={() => {
            if (!tentarReserva()) setState("error");
          }}
          className="h-full w-full object-cover"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* Com miniatura, a ampliação é a ORIGINAL, pela rota: o clique pode vir
              depois de a URL assinada da lista vencer, e a rota assina de novo. */}
          <img
            src={srcMiniatura ? (srcReserva ?? original) : src}
            alt={alt}
            className="max-h-[85vh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
