"use client";

import { useId, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { CaretDown } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A transcrição do áudio, recolhida por padrão, embaixo do player.
 *
 * Recolhida porque a bolha é do ÁUDIO: aberta, uma mensagem de voz de dois
 * minutos viraria um parágrafo que empurra a conversa inteira. Quem quer ler
 * sem ouvir (atendente em lugar barulhento, conferência rápida) abre com um
 * clique. Botão com `aria-expanded` + `aria-controls`, e não `<details>`, para
 * o estado ser lido do mesmo jeito em todo leitor de tela.
 *
 * O texto é do worker de mídia, gerado por modelo: pode errar nome e número. A
 * etiqueta diz "Transcrição" e o texto vai em itálico para não se passar por
 * palavra escrita pelo cliente.
 */
export function TranscricaoDoAudio({ texto }: { texto: string }) {
  const t = useT();
  const id = useId();
  const [aberta, setAberta] = useState(false);

  return (
    <div className="mt-1 text-xs" data-testid="bolha-transcricao-do-audio">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => setAberta((v) => !v)}
        className="flex items-center gap-1 rounded-sm font-semibold text-text-muted hover:text-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CaretDown size={11} aria-hidden className={cn("transition-transform", !aberta && "-rotate-90")} />
        {aberta ? t("Ocultar transcrição") : t("Mostrar transcrição")}
      </button>
      {/* Sempre montado (com `hidden`): o `aria-controls` aponta para algo que existe. */}
      <p id={id} hidden={!aberta} className="mt-1 whitespace-pre-wrap wrap-anywhere italic text-text">
        <span className="sr-only">{`${t("Transcrição")}: `}</span>
        {texto}
      </p>
    </div>
  );
}
