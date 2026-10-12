"use client";
import { useState, useSyncExternalStore } from "react";

const CHAVE = "crm-funil-do-celular";
const ouvintes = new Set<() => void>();

function ler(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    ouvintes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}

/**
 * O funil que a aba Funil do celular mostra (M3.1): o último escolhido neste aparelho
 * (`localStorage`, conveniência por aparelho), senão o padrão, senão o primeiro. Um
 * id que não está mais na lista (funil arquivado, outra organização) cai no padrão.
 *
 * Lido por `useSyncExternalStore` (como as larguras das colunas da Inbox), e não no
 * inicializador do `useState`: o servidor e a primeira pintura veem `null` (o padrão),
 * e o escolhido chega logo depois, sem divergir na hidratação (P1 do Cassio na #182).
 */
export function useFunilEscolhido(funis: readonly { id: string; is_default?: boolean }[]): [string | null, (id: string) => void] {
  const salvo = useSyncExternalStore(assinar, ler, () => null);
  // A escolha desta visita vale mesmo com o armazenamento bloqueado.
  const [destaVisita, setDestaVisita] = useState<string | null>(null);
  const escolhido = destaVisita ?? salvo;
  const valido = funis.some((f) => f.id === escolhido) ? escolhido : null;
  const atual = valido ?? funis.find((f) => f.is_default)?.id ?? funis[0]?.id ?? null;
  const escolher = (id: string) => {
    setDestaVisita(id);
    try {
      window.localStorage.setItem(CHAVE, id);
    } catch {
      // Armazenamento bloqueado: a escolha não fica lembrada.
    }
    for (const aviso of ouvintes) aviso();
  };
  return [atual, escolher];
}
