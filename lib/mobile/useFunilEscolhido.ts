"use client";
import { useState } from "react";

const CHAVE = "crm-funil-do-celular";

function ler(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

/**
 * O funil que a aba Funil do celular mostra (M3.1): o último escolhido neste aparelho
 * (`localStorage`, conveniência por aparelho), senão o padrão, senão o primeiro. Um
 * id que não está mais na lista (funil arquivado, outra organização) cai no padrão.
 */
export function useFunilEscolhido(funis: readonly { id: string; is_default?: boolean }[]): [string | null, (id: string) => void] {
  const [escolhido, setEscolhido] = useState<string | null>(() => (typeof window === "undefined" ? null : ler()));
  const valido = funis.some((f) => f.id === escolhido) ? escolhido : null;
  const atual = valido ?? funis.find((f) => f.is_default)?.id ?? funis[0]?.id ?? null;
  const escolher = (id: string) => {
    setEscolhido(id);
    try {
      window.localStorage.setItem(CHAVE, id);
    } catch {
      // Armazenamento bloqueado: a escolha vale só nesta visita.
    }
  };
  return [atual, escolher];
}
