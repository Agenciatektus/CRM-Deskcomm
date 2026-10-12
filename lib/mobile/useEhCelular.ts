"use client";
import { useSyncExternalStore } from "react";

/** O corte do app de celular, o mesmo do `@custom-variant mb` (globals.css). */
export const MIDIA_DO_CELULAR = "(max-width: 759px)";

function assinar(avisar: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const midia = window.matchMedia(MIDIA_DO_CELULAR);
  midia.addEventListener("change", avisar);
  return () => midia.removeEventListener("change", avisar);
}

const agora = () => typeof window.matchMedia === "function" && window.matchMedia(MIDIA_DO_CELULAR).matches;

/**
 * Está abaixo de 760px agora? Para o que só deve EXISTIR no celular (consultas, não
 * aparência: aparência é `mb:` no CSS, que não pisca). No servidor e na hidratação é
 * `false`; o valor real chega logo depois.
 */
export function useEhCelular(): boolean {
  return useSyncExternalStore(assinar, agora, () => false);
}
