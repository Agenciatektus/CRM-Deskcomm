"use client";
import { type KeyboardEvent, type PointerEvent, type RefObject, useRef, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import {
  LARGURA_DA_LISTA,
  LARGURA_DO_PAINEL,
  limitar,
  maximoDe,
  PASSO,
  PASSO_GRANDE,
  type Coluna,
  type Larguras,
} from "./larguras";

interface Props {
  coluna: Coluna;
  larguras: Larguras;
  /** O cartão da Inbox: a largura útil decide quanto as laterais podem crescer. */
  cartaoRef: RefObject<HTMLElement | null>;
  comPainel: boolean;
  mover: (coluna: Coluna, valor: number) => void;
  confirmar: (coluna: Coluna, valor: number) => void;
  restaurar: (coluna: Coluna) => void;
}

/**
 * O pegador entre duas colunas (o `.rz` do protótipo): arrastar, setas do
 * teclado (Shift para o passo grande, Home/End para os extremos) e duplo clique
 * para voltar ao padrão.
 *
 * `role="separator"` com `aria-valuenow`: é o padrão ARIA do divisor que se
 * move, e o leitor de tela anuncia a largura a cada passo. A área de toque tem
 * 11px; o traço visível é de 1px e engrossa no hover, no foco e no arrasto,
 * com o degradê vibrante da pele no escuro.
 *
 * Só existe a partir de 1536px (`2xl`): abaixo disso as larguras são as faixas
 * fixas por breakpoint, porque não sobra espaço para regular sem espremer a
 * conversa abaixo do mínimo.
 */
export function PegadorDeColuna({ coluna, larguras, cartaoRef, comPainel, mover, confirmar, restaurar }: Props) {
  const t = useT();
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ x: number; largura: number; atual: number } | null>(null);
  const faixa = coluna === "lista" ? LARGURA_DA_LISTA : LARGURA_DO_PAINEL;
  const valor = larguras[coluna];
  const total = () => cartaoRef.current?.clientWidth ?? 0;
  // Pegador da lista mora à direita dela; o do painel, à esquerda do painel.
  const sentido = coluna === "lista" ? 1 : -1;

  function aoApertar(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    inicio.current = { x: e.clientX, largura: valor, atual: valor };
    setArrastando(true);
  }

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return;
    const bruto = inicio.current.largura + sentido * (e.clientX - inicio.current.x);
    const novo = limitar(coluna, bruto, larguras, total(), comPainel);
    inicio.current.atual = novo;
    mover(coluna, novo);
  }

  function aoSoltar(e: PointerEvent<HTMLDivElement>) {
    if (!inicio.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    confirmar(coluna, inicio.current.atual);
    inicio.current = null;
    setArrastando(false);
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.shiftKey ? PASSO_GRANDE : PASSO;
    let alvo: number | null = null;
    if (e.key === "ArrowRight") alvo = valor + sentido * passo;
    else if (e.key === "ArrowLeft") alvo = valor - sentido * passo;
    else if (e.key === "Home") alvo = faixa.min;
    else if (e.key === "End") alvo = maximoDe(coluna, larguras, total(), comPainel);
    else if (e.key === "Enter") {
      e.preventDefault();
      restaurar(coluna);
      return;
    }
    if (alvo === null) return;
    e.preventDefault();
    confirmar(coluna, limitar(coluna, alvo, larguras, total(), comPainel));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={coluna === "lista" ? t("Largura da lista de conversas") : t("Largura do painel do lead")}
      aria-valuenow={valor}
      aria-valuemin={faixa.min}
      // O teto da FAIXA: o teto real (que depende da largura do cartão) só é
      // medido nos gestos, porque ler a ref durante o render é proibido.
      aria-valuemax={faixa.max}
      title={t("Arraste para ajustar; duplo clique volta ao padrão")}
      tabIndex={0}
      data-arrastando={arrastando ? "true" : undefined}
      data-testid={`pegador-${coluna}`}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onDoubleClick={() => restaurar(coluna)}
      onKeyDown={aoTeclar}
      style={
        coluna === "lista"
          ? { left: `calc(var(--largura-da-lista) - 6px)` }
          : { right: `calc(var(--largura-do-painel) - 6px)` }
      }
      className={cn(
        "group/pegador absolute inset-y-0 z-10 hidden w-[11px] cursor-col-resize touch-none justify-center 2xl:flex",
        "focus-visible:outline-hidden",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-full w-px bg-transparent transition-[background-color,width]",
          "group-hover/pegador:w-0.5 group-hover/pegador:bg-accent group-focus-visible/pegador:w-0.5 group-focus-visible/pegador:bg-accent",
          "group-data-[arrastando=true]/pegador:w-0.5 group-data-[arrastando=true]/pegador:bg-accent",
          // Escuro: o traço vira o degradê vibrante da pele (o `.rz:hover::before`).
          "dark:group-hover/pegador:bg-(image:--pele-grad) dark:group-focus-visible/pegador:bg-(image:--pele-grad) dark:group-data-[arrastando=true]/pegador:bg-(image:--pele-grad)",
        )}
      />
    </div>
  );
}
