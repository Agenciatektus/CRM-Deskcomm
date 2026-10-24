"use client";

import { useEffect } from "react";

/**
 * Revelar ao rolar, sem gatilho por elemento. Roda uma vez, depois da hidratação:
 *  1. marca como visível o que já está na tela (sem piscar);
 *  2. só então liga a classe `com-js` no <html>, que passa a esconder o que ainda está abaixo;
 *  3. observa o resto e marca `data-visivel` quando entra na janela.
 *
 * O CSS (globals.css) só esconde sob `.com-js` e sob `prefers-reduced-motion: no-preference`: sem
 * JavaScript, ou com movimento reduzido, nada fica escondido. A ordem 1 -> 2 evita que um bloco
 * visível suma por um quadro antes de reaparecer.
 */
export function Movimento() {
  useEffect(() => {
    const alvos = Array.from(document.querySelectorAll<HTMLElement>(".revela"));
    const altura = window.innerHeight;
    for (const el of alvos) {
      const r = el.getBoundingClientRect();
      if (r.top < altura * 0.98) el.setAttribute("data-visivel", "");
    }
    document.documentElement.classList.add("com-js");

    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-visivel", "");
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const el of alvos) if (!el.hasAttribute("data-visivel")) obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return null;
}
