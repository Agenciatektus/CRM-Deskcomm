"use client";
import { useCallback, useEffect, useState } from "react";

export type VistaDeConexoes = "galeria" | "lista";
export const CHAVE_DA_VISTA_DE_CONEXOES = "conexoes_vista";

function lerGuardada(): VistaDeConexoes {
  try {
    return window.localStorage.getItem(CHAVE_DA_VISTA_DE_CONEXOES) === "lista" ? "lista" : "galeria";
  } catch {
    // Armazenamento bloqueado: segue no padrão (Galeria).
    return "galeria";
  }
}

/** Galeria é o padrão; a escolha fica neste navegador. Lê depois da hidratação. */
export function useVistaDeConexoes(): [VistaDeConexoes, (v: VistaDeConexoes) => void] {
  const [vista, setVista] = useState<VistaDeConexoes>("galeria");
  useEffect(() => setVista(lerGuardada()), []);
  const mudar = useCallback((v: VistaDeConexoes) => {
    setVista(v);
    try {
      window.localStorage.setItem(CHAVE_DA_VISTA_DE_CONEXOES, v);
    } catch {
      // Sem armazenamento a escolha vale só nesta visita.
    }
  }, []);
  return [vista, mudar];
}
