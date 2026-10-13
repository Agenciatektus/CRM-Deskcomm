"use client";
import { useEffect } from "react";

/**
 * O COMPOSER ACIMA DO TECLADO (M2.3). Duas metades, uma por navegador:
 * - Chrome do Android: `interactiveWidget: "resizes-content"` no viewport
 *   (app/layout.tsx) faz o teclado encolher a página, e o `100dvh` encolhe junto.
 * - Safari do iPhone: o teclado NÃO encolhe a página, só a área visível
 *   (`visualViewport`). Este hook publica a diferença em `--mb-teclado` no `<html>`,
 *   e a altura da conversa no celular a desconta.
 * No Android, com a página já encolhida, a diferença dá ~0: não desconta duas vezes.
 * Só liga abaixo de 760px (`habilitado`); no desktop a variável nem existe.
 */
export function useAlturaDoTeclado(habilitado: boolean): void {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!habilitado || !vv) return;
    const raiz = document.documentElement;
    const medir = () => {
      const teclado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      raiz.style.setProperty("--mb-teclado", `${teclado}px`);
    };
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      raiz.style.removeProperty("--mb-teclado");
    };
  }, [habilitado]);
}
