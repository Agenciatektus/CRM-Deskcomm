"use client";
import { useEffect, useState } from "react";

/**
 * A confirmação que acabou de aparecer ainda NÃO está armada: os botões ficam
 * desativados por um instante (300 ms), porque a confirmação dentro do
 * componente nasce no lugar do item clicado e um duplo clique cairia no botão
 * destrutivo (P2-4 do Cassio na #169).
 */
export const TEMPO_PARA_ARMAR = 300;

export function useArmado(ms: number = TEMPO_PARA_ARMAR): boolean {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmado(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return armado;
}
