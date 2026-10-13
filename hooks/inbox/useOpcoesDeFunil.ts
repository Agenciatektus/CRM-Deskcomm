"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export interface OpcaoDeFunil {
  id: string;
  name: string;
  etapas: { id: string; name: string }[];
}

/** Funis e etapas para os filtros da Inbox (agent+, `GET /api/v1/pipelines/opcoes`). */
export function useOpcoesDeFunil(enabled: boolean) {
  return useQuery({
    queryKey: ["inbox", "opcoes-de-funil"],
    queryFn: () => apiClient.get<{ data: { funis: OpcaoDeFunil[] } }>("/api/v1/pipelines/opcoes"),
    enabled,
    staleTime: 60_000,
    select: (r) => r.data.funis,
  });
}
