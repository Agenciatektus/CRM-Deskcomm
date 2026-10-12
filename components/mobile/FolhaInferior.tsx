"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type ComponentType, type PointerEvent, type ReactNode } from "react";

import { useT } from "@/hooks/i18n/useT";
import { X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Quanto arrastar para baixo fecha a folha (px), ou a velocidade que já basta (px/ms). */
const DISTANCIA_PARA_FECHAR = 96;
const VELOCIDADE_PARA_FECHAR = 0.6;

/**
 * A folha inferior do app de celular (o `.sheet` do protótipo): alça, título, fundo
 * escuro que fecha, foco preso e Esc (pelo Dialog do Radix), arrastar a alça para
 * baixo fecha, área segura embaixo, altura até `--mb-folha-max` com rolagem interna,
 * raio `--mb-folha-raio`. A subida respeita `prefers-reduced-motion`.
 *
 * Para os popovers e menus que já existem, a folha é a do CSS (`folhaNoCelular` em
 * PopoverContent e DropdownMenuContent, regra em globals.css), com as mesmas medidas.
 */
export function FolhaInferior({
  aberto,
  aoMudar,
  titulo,
  subtitulo,
  children,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [deslocamento, setDeslocamento] = useState(0);
  const arraste = useRef<{ y: number; t: number } | null>(null);

  const aoApertar = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arraste.current = { y: e.clientY, t: performance.now() };
  };
  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    if (!arraste.current) return;
    setDeslocamento(Math.max(0, e.clientY - arraste.current.y));
  };
  const aoSoltar = (e: PointerEvent<HTMLDivElement>) => {
    if (!arraste.current) return;
    const dy = Math.max(0, e.clientY - arraste.current.y);
    const velocidade = dy / Math.max(1, performance.now() - arraste.current.t);
    arraste.current = null;
    setDeslocamento(0);
    if (dy > DISTANCIA_PARA_FECHAR || velocidade > VELOCIDADE_PARA_FECHAR) aoMudar(false);
  };

  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[oklch(0.12_0.01_260/0.52)] data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        <Dialog.Content
          style={deslocamento ? { transform: `translateY(${deslocamento}px)` } : undefined}
          className={cn(
            "pele-ruido fixed inset-x-0 bottom-0 z-50 flex max-h-(--mb-folha-max) flex-col rounded-t-(--mb-folha-raio) bg-surface pt-2 pb-[calc(10px+var(--mb-area-baixo))] shadow-pop outline-hidden",
            "data-[state=open]:animate-folha-sobe motion-reduce:animate-none",
          )}
        >
          <div
            role="presentation"
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-0.5 pb-1.5"
          >
            <span className="h-(--mb-pegador-altura) w-(--mb-pegador-largura) rounded-full bg-border-strong" />
          </div>
          <div className="flex shrink-0 items-center gap-2 pr-2 pb-1.5 pl-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[19px] leading-tight font-bold text-text">{titulo}</Dialog.Title>
              {subtitulo ? (
                <Dialog.Description className="mt-0.5 text-[13.5px] text-text-muted">{subtitulo}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={t("Fechar")}
              className="pele-foco grid size-(--mb-alvo) shrink-0 place-items-center rounded-full text-text hover:bg-hover"
            >
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-2">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Um item da folha (o `.si` do protótipo): ícone, título, linha de apoio, 56px de altura. */
export function ItemDaFolha({
  icone: Icone,
  titulo,
  apoio,
  aoTocar,
  perigo = false,
}: {
  icone: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  titulo: string;
  apoio?: string;
  aoTocar: () => void;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      className="pele-foco grid min-h-(--mb-folha-item) w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3.5 rounded-[14px] px-3 py-2 text-left hover:bg-hover"
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl",
          perigo ? "bg-error-bg text-error-fg" : "bg-accent-soft text-accent-text",
        )}
      >
        <Icone size={22} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-base leading-snug font-semibold", perigo ? "text-error-fg" : "text-text")}>{titulo}</span>
        {apoio && <span className="mt-0.5 block text-[13.5px] leading-snug text-text-muted">{apoio}</span>}
      </span>
    </button>
  );
}
