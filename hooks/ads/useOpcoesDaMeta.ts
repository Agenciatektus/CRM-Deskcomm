"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { OpcaoDaMeta } from "@/lib/plataformas-de-anuncio/meta/insights";

/**
 * Pixels e Páginas para os seletores de Conversões. Mesma regra de cota dos
 * hooks de `useMetaAds`: `retry: false` (erro de token não melhora com repetição)
 * e nada de refetch por foco. Só buscam quando `enabled`, isto é, com conexão de
 * leitura e o seletor à vista.
 */
const OPCOES = { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } as const;

export function usePixelsDaMeta(conta: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["ads", "meta", "pixels", conta],
    queryFn: async () =>
      apiClient.get<{ data: { pixels: OpcaoDaMeta[] } }>(
        `/api/v1/ads/meta/pixels?${new URLSearchParams({ conta: conta as string })}`,
      ),
    enabled: enabled && Boolean(conta),
    ...OPCOES,
  });
}

export function usePaginasDaMeta(enabled: boolean) {
  return useQuery({
    queryKey: ["ads", "meta", "pages"],
    queryFn: async () => apiClient.get<{ data: { paginas: OpcaoDaMeta[] } }>("/api/v1/ads/meta/pages"),
    enabled,
    ...OPCOES,
  });
}
