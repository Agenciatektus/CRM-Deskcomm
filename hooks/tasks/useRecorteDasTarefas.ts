"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { guardar, valorDoUsuario } from "@/hooks/kanban/usePreferenciasDoFunil";
import {
  aplicarFiltros,
  comparadorDasTarefas,
  contagensDosAtalhos,
  filtrosDaUrl,
  filtrosParaUrl,
  type FiltrosDeTarefas,
} from "@/lib/tarefas/recorte";
import type { Tarefa } from "@/lib/tarefas/tipos";

/**
 * O RECORTE da tela de Tarefas, no padrão de `useRecorteDoFunil`: os filtros
 * moram na URL (deep-link: dá para mandar "as atrasadas do Pedro" num link) e a
 * última query string fica guardada POR PESSOA neste navegador
 * (`<id>:<valor>`, a mesma mecânica das preferências do Funil). Abrir a tela
 * sem filtro na URL volta ao recorte da última visita.
 */
export const CHAVE_DOS_FILTROS_DAS_TAREFAS = "tarefas_filtros";

function lerGuardado(usuarioId: string): string | null {
  try {
    return valorDoUsuario(window.localStorage.getItem(CHAVE_DOS_FILTROS_DAS_TAREFAS), usuarioId);
  } catch {
    return null;
  }
}

export function useRecorteDasTarefas(tarefas: readonly Tarefa[], usuarioId: string | undefined, agora: Date) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(new URLSearchParams(searchParams.toString())), [searchParams]);

  const setFiltros = useCallback(
    (proximos: FiltrosDeTarefas) => {
      const qs = filtrosParaUrl(proximos);
      if (usuarioId) guardar(CHAVE_DOS_FILTROS_DAS_TAREFAS, usuarioId, qs);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, usuarioId],
  );

  // Depois da hidratação (efeito): o 1º render é sempre o padrão. Só restaura
  // quando a URL chega sem filtro — link com filtro manda.
  const restaurado = useRef(false);
  useEffect(() => {
    if (!usuarioId || restaurado.current) return;
    restaurado.current = true;
    if (filtrosParaUrl(filtrosDaUrl(new URLSearchParams(searchParams.toString())))) return;
    const guardados = lerGuardado(usuarioId);
    if (!guardados) return;
    const params = new URLSearchParams(guardados);
    // `?criar=1` (o "+" do celular) não pode se perder na restauração.
    const criar = searchParams.get("criar");
    if (criar) params.set("criar", criar);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [usuarioId, searchParams, router, pathname]);

  return useMemo(() => {
    const ctx = { usuarioId, agora };
    const recorte = aplicarFiltros(tarefas, filtros, ctx).sort(comparadorDasTarefas(filtros.ordem));
    return { filtros, setFiltros, recorte, contagens: contagensDosAtalhos(tarefas, filtros, ctx) };
  }, [tarefas, filtros, setFiltros, usuarioId, agora]);
}
