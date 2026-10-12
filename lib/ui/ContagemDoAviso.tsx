"use client";

import { useEffect, useState } from "react";

/**
 * O texto do aviso de ação adiada com o tempo que falta ("Ganho em 5 s"),
 * contado de segundo em segundo (follow-up do Cassio na #169). Quem lê com
 * leitor de tela ouve o texto UMA vez, com o tempo inicial: o número que muda
 * fica fora da região viva, para não ser anunciado a cada segundo.
 */
export function ContagemDoAviso({
  texto,
  segundos,
}: {
  texto: (segundosRestantes: number) => string;
  segundos: number;
}) {
  const [restam, setRestam] = useState(segundos);
  useEffect(() => {
    const id = setInterval(() => setRestam((s) => Math.max(1, s - 1)), 1_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span>
      <span aria-hidden className="tabular-nums">{texto(restam)}</span>
      <span className="sr-only">{texto(segundos)}</span>
    </span>
  );
}
