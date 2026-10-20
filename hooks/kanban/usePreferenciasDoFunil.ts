"use client";

import { useCallback, useSyncExternalStore } from "react";

import { ehOrdemDoFunil, ORDEM_PADRAO, type OrdemDoFunil } from "@/lib/kanban/ordem-do-funil";

/**
 * O que a barra do Funil lembra POR PESSOA neste navegador: o modo de ver
 * (Kanban × Lista), a ordem e os filtros. Mesma mecânica da densidade
 * (`criarPreferenciaCompacta`): uma entrada por navegador com o id de quem
 * gravou (`<id>:<valor>`); de outro id, vale o padrão. Sem tabela, sem migration.
 *
 * `useSyncExternalStore` com servidor = `null`: o 1º render (servidor e
 * hidratação) é sempre o padrão; o guardado entra no render seguinte.
 */
const limparId = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "");

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/** O valor guardado para ESTE usuário, ou `null` (outro id, ausente, sem armazenamento). */
export function valorDoUsuario(bruto: string | null, usuarioId: string | null | undefined): string | null {
  if (!bruto || !usuarioId) return null;
  const prefixo = `${limparId(usuarioId)}:`;
  return bruto.startsWith(prefixo) ? bruto.slice(prefixo.length) : null;
}

export function guardar(chave: string, usuarioId: string, valor: string): boolean {
  try {
    window.localStorage.setItem(chave, `${limparId(usuarioId)}:${valor}`);
    return true;
  } catch {
    return false;
  }
}

function criarPreferencia<T extends string>(chave: string, valido: (v: unknown) => v is T, padrao: T) {
  const ouvintes = new Set<() => void>();
  const assinar = (ouvir: () => void) => {
    ouvintes.add(ouvir);
    const deOutraAba = (e: StorageEvent) => {
      if (e.key === chave) ouvir();
    };
    window.addEventListener("storage", deOutraAba);
    return () => {
      ouvintes.delete(ouvir);
      window.removeEventListener("storage", deOutraAba);
    };
  };
  return function usePreferencia(usuarioId: string | null | undefined): [T, (v: T) => void] {
    const bruto = useSyncExternalStore(assinar, () => ler(chave), () => null);
    const guardado = valorDoUsuario(bruto, usuarioId);
    const valor = valido(guardado) ? guardado : padrao;
    const mudar = useCallback(
      (novo: T) => {
        if (!usuarioId || !guardar(chave, usuarioId, novo)) return;
        for (const ouvir of ouvintes) ouvir();
      },
      [usuarioId],
    );
    return [valor, mudar];
  };
}

// "calendario": a visão Calendário do upstream (#2770), terceira opção da barra.
export type VistaDoFunil = "kanban" | "lista" | "calendario";
const ehVista = (v: unknown): v is VistaDoFunil => v === "kanban" || v === "lista" || v === "calendario";

export const CHAVE_DA_VISTA = "funil_vista";
export const CHAVE_DA_ORDEM = "funil_ordem";

export const useVistaDoFunil = criarPreferencia<VistaDoFunil>(CHAVE_DA_VISTA, ehVista, "kanban");
export const useOrdemDoFunil = criarPreferencia<OrdemDoFunil>(CHAVE_DA_ORDEM, ehOrdemDoFunil, ORDEM_PADRAO);

/**
 * Os FILTROS moram na URL (deep-link, padrão do repo); aqui fica a última
 * query string de cada funil, para voltar a ela quando a pessoa abre o funil
 * sem filtro na URL.
 */
export const chaveDosFiltros = (pipelineId: string) => `funil_filtros:${pipelineId}`;

export function filtrosGuardados(pipelineId: string, usuarioId: string | null | undefined): string | null {
  return valorDoUsuario(ler(chaveDosFiltros(pipelineId)), usuarioId);
}
