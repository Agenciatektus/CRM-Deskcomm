"use client";

import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";

/**
 * ONDE o menu de contexto da conversa está aberto, e de quem.
 *
 * Um menu só por lista, não um por linha: com 50 conversas na tela seriam 50
 * árvores do Radix montadas para responder a um clique que acontece numa delas.
 * A lista guarda o alvo; o menu lê a conversa VIVA pelo id (o realtime pode
 * mudar o dono enquanto ele está aberto).
 *
 * `x`/`y` é o ponto de ancoragem em coordenadas da janela. Quem garante que o
 * menu não sai pela borda é o posicionamento do Radix (flip para cima, shift
 * para a esquerda e altura máxima com rolagem própria); aqui só se decide o
 * ponto de partida.
 */
export interface AlvoDoMenu {
  id: string;
  x: number;
  y: number;
  /** Para onde o foco volta quando o menu fecha sem abrir janela. */
  origem: HTMLElement | null;
  /** Muda a cada abertura: remonta o menu já medido no ponto novo. */
  vez: number;
}

export type AbrirMenu = (
  id: string,
  ancora: { x: number; y: number } | HTMLElement,
  origem: HTMLElement | null,
) => void;

let contador = 0;

/** O ponto de um elemento: canto inferior esquerdo, logo abaixo dele. */
export function pontoDoElemento(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.bottom) };
}

export function useMenuDaConversa() {
  const [alvo, setAlvo] = useState<AlvoDoMenu | null>(null);

  const abrir = useCallback<AbrirMenu>((id, ancora, origem) => {
    const ponto = ancora instanceof HTMLElement ? pontoDoElemento(ancora) : ancora;
    contador += 1;
    setAlvo({ id, x: ponto.x, y: ponto.y, origem, vez: contador });
  }, []);

  const fechar = useCallback(() => setAlvo(null), []);

  return { alvo, abrir, fechar };
}

/**
 * Os gatilhos do menu na LINHA. Sem `abrir`, nenhum (a linha fica como antes).
 *
 * Botão direito abre no ponto do clique. A tecla de menu do teclado também
 * dispara `contextmenu`, mas com o ponto zerado: aí o menu ancora na própria
 * linha. Shift+F10 e a tecla de menu são tratados no `keydown` também, sem
 * depender de o navegador transformá-los em `contextmenu`.
 */
export function gatilhosDoMenu(id: string, abrir: AbrirMenu | undefined, aberto = false) {
  if (!abrir) return {};
  return {
    "aria-haspopup": "menu" as const,
    "aria-expanded": aberto,
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      const doTeclado = e.clientX === 0 && e.clientY === 0;
      abrir(id, doTeclado ? e.currentTarget : { x: e.clientX, y: e.clientY }, e.currentTarget);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        abrir(id, e.currentTarget, e.currentTarget);
      }
    },
  };
}
