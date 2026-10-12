"use client";
import { useSyncExternalStore } from "react";

/**
 * A janela tem 1024px ou mais? Abaixo disso o menu nunca fixa ao lado (quadro DS,
 * "Navegação em 2 colunas"): fica só o trilho de 72px, e as páginas abrem por cima.
 * No servidor e na hidratação vale `true` (o desktop), e o valor real entra logo
 * depois; a largura da `<aside>` já obedece ao corte por CSS (`max-lg:`), então
 * não há pulo de layout.
 */
const CONSULTA = "(min-width: 1024px)";

const temMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

function assinar(aviso: () => void): () => void {
  if (!temMatchMedia()) return () => undefined;
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

export function useCabeNoDesktop(): boolean {
  return useSyncExternalStore(
    assinar,
    () => (temMatchMedia() ? window.matchMedia(CONSULTA).matches : true),
    () => true,
  );
}
