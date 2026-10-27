"use client";

import { useEffect, useRef } from "react";

import {
  chaveDoFiltroLembrado,
  haFiltroAtivo,
  lerFiltroLembrado,
  normalizarFiltros,
  type FiltrosSalvos,
} from "@/lib/inbox/filtros-salvos";

type Aux = Parameters<typeof normalizarFiltros>[0] & { search?: string };

/**
 * Lembra o filtro do Inbox por atendente (localStorage, chave com o id) e o
 * devolve quando a pessoa volta sem filtro na URL. Link com filtro (`?tag=`,
 * `?busca=`, `?sem_passo=`...) manda: nada é restaurado por cima dele.
 *
 * Limpar os filtros zera o estado e, por consequência, apaga o lembrado.
 * Armazenamento bloqueado ou valor de forma estranha: ignora, sem quebrar a tela.
 */
export function useFiltroLembrado(
  usuarioId: string | null | undefined,
  aux: Aux,
  restaurar: (filtros: FiltrosSalvos) => void,
) {
  const pronto = useRef<string | null>(null);
  const auxRef = useRef(aux);
  const restaurarRef = useRef(restaurar);
  useEffect(() => {
    auxRef.current = aux;
    restaurarRef.current = restaurar;
  });

  // 1) Uma vez por usuário: restaura, se a URL não trouxe filtro.
  useEffect(() => {
    if (!usuarioId || pronto.current === usuarioId) return;
    pronto.current = usuarioId;
    const atual = auxRef.current;
    if (haFiltroAtivo(atual) || atual.search) return;
    let guardado: string | null = null;
    try {
      guardado = window.localStorage.getItem(chaveDoFiltroLembrado(usuarioId));
    } catch {
      return;
    }
    const lido = lerFiltroLembrado(guardado);
    if (lido) restaurarRef.current(lido);
  }, [usuarioId]);

  // 2) Depois da restauração: cada mudança grava, e sem filtro o lembrado some.
  useEffect(() => {
    if (!usuarioId || pronto.current !== usuarioId) return;
    const filtros = normalizarFiltros(aux);
    try {
      const chave = chaveDoFiltroLembrado(usuarioId);
      if (Object.keys(filtros).length === 0) window.localStorage.removeItem(chave);
      else window.localStorage.setItem(chave, JSON.stringify(filtros));
    } catch {
      // Sem armazenamento, o filtro só não é lembrado.
    }
  }, [usuarioId, aux]);
}
