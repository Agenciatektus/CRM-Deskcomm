"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { chaveDosFiltros, filtrosGuardados, guardar } from "@/hooks/kanban/usePreferenciasDoFunil";
import { applyFilters, filtersFromParams, filtersToParams, type LeadFilters } from "@/lib/kanban/filters";
import { comparadorDoFunil, type OrdemDoFunil } from "@/lib/kanban/ordem-do-funil";
import { estaAtrasado, estaParado, resumoDoRecorte, semProximoPasso } from "@/lib/kanban/recorte-do-funil";
import type { BoardData } from "@/lib/kanban/types";
import { categoriaDoMotivo } from "@/lib/leads/motivos-de-perda-do-funil";

/**
 * O RECORTE do Funil: os filtros (na URL, deep-linkável, e lembrados por
 * pessoa e funil), os leads que passam, as contagens dos atalhos e o resumo
 * do título. Tudo sobre o payload do quadro, que já vem inteiro e paginado
 * (`buscarTodasAsPaginas`): nenhuma consulta nova.
 */
export function useRecorteDoFunil(
  pipelineId: string,
  data: BoardData | undefined,
  userId: string | undefined,
  ordem: OrdemDoFunil,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const setFilters = useCallback(
    (next: LeadFilters) => {
      const qs = filtersToParams(next);
      if (userId) guardar(chaveDosFiltros(pipelineId), userId, qs);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, pipelineId, userId],
  );

  // Volta aos filtros da última visita quando o funil abre SEM filtro na URL.
  // Depois da hidratação (efeito): o 1º render é sempre o padrão.
  const restaurado = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || restaurado.current === pipelineId) return;
    restaurado.current = pipelineId;
    if (filtersToParams(filtersFromParams(searchParams))) return;
    const guardados = filtrosGuardados(pipelineId, userId);
    if (!guardados) return;
    const params = new URLSearchParams(guardados);
    const lead = searchParams.get("lead");
    if (lead) params.set("lead", lead);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [userId, pipelineId, searchParams, router, pathname]);

  return useMemo(() => {
    const leads = data?.leads ?? [];
    const agora = new Date();
    const limites = new Map((data?.stages ?? []).map((s) => [s.id, s.expected_duration_hours]));
    const contexto = {
      categoriaDo: (motivo: string) => categoriaDoMotivo(motivo, data?.pipeline.settings),
      userId,
      limiteDaEtapa: (id: string) => limites.get(id),
      agora,
    };
    const recorte = applyFilters(leads, filters, contexto);
    // As contagens dos atalhos olham o recorte SEM os atalhos: o número diz
    // quantos o toque vai mostrar com o resto dos filtros como está.
    const semAtalhos = applyFilters(
      leads,
      { ...filters, meus: undefined, overdueOnly: undefined, semPasso: undefined, parados: undefined },
      contexto,
    );
    return {
      filters,
      setFilters,
      recorte,
      ordenados: [...recorte].sort(comparadorDoFunil(ordem)),
      resumo: data ? resumoDoRecorte(recorte, agora) : null,
      contagens: {
        atrasados: semAtalhos.filter((l) => estaAtrasado(l, agora)).length,
        semPasso: semAtalhos.filter(semProximoPasso).length,
        parados: semAtalhos.filter((l) => estaParado(l, contexto.limiteDaEtapa, agora)).length,
      },
    };
  }, [data, filters, setFilters, userId, ordem]);
}
