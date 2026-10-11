"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Mede algo do DOM DEPOIS de a vitrine ter ajustado o tema do <html>.
 *
 * Efeito de filho roda antes do efeito do pai, e é o pai
 * (`VitrineDoDesignSystem`) quem troca o `data-theme`. Medir no efeito do filho
 * leria o tema anterior; um quadro de animação depois, o tema já é o certo.
 * A vitrine também remonta os painéis a cada troca de modo (`key`), então a
 * medida roda de novo sempre que o tema muda.
 *
 * `medir` deve ser estável (função de módulo): ela entra nas dependências.
 */
export function useMedida<E extends HTMLElement, T>(
  medir: (el: E) => T,
): [RefObject<E | null>, T | null] {
  const ref = useRef<E | null>(null);
  const [valor, setValor] = useState<T | null>(null);

  useEffect(() => {
    const quadro = requestAnimationFrame(() => {
      if (ref.current) setValor(medir(ref.current));
    });
    return () => cancelAnimationFrame(quadro);
  }, [medir]);

  return [ref, valor];
}
