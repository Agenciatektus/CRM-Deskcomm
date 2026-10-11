"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";

/**
 * Quantos leads abertos há em cada funil: o número ao lado de cada funil no nó
 * "Pipeline" do menu (S18). Uma contagem agregada no banco
 * (`GET /api/v1/leads/abertos-por-funil`, migration 9047), pela RLS de quem
 * pede: o `agent` em modo `own` vê o número do quadro DELE.
 *
 * Só consulta com o nó ABERTO (`ativo`): fechado, ninguém vê o número, e cada
 * aba do navegador pagaria uma consulta por minuto à toa.
 */
export function useLeadsAbertosPorFunil(ativo: boolean) {
  const { activeOrg } = useAuth();
  const orgId = activeOrg?.orgId ?? null;
  return useQuery({
    queryKey: ["leads", "abertos-por-funil", orgId],
    enabled: ativo && !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => apiClient.get<{ data: { por_funil: Record<string, number> } }>("/api/v1/leads/abertos-por-funil"),
    select: (r) => r?.data?.por_funil ?? {},
  });
}
