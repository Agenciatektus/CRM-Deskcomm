"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { FiltrosSalvos } from "@/lib/inbox/filtros-salvos";

export interface FiltroSalvo {
  id: string;
  nome: string;
  filtros: FiltrosSalvos;
}

/** Os filtros nomeados do usuário (banco, vale em qualquer aparelho). */
export function useFiltrosSalvos(orgId: string | null, userId: string | null | undefined) {
  const qc = useQueryClient();
  const chave = ["inbox-filtros-salvos", orgId, userId];
  const lista = useQuery({
    enabled: !!orgId && !!userId,
    queryKey: chave,
    queryFn: () => apiClient.get<{ data: FiltroSalvo[] }>("/api/v1/inbox/filtros-salvos"),
    staleTime: 60_000,
    select: (res) => res.data,
  });
  const salvar = useMutation({
    mutationFn: (corpo: { nome: string; filtros: FiltrosSalvos }) =>
      apiClient.post("/api/v1/inbox/filtros-salvos", corpo),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/inbox/filtros-salvos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });
  return { lista, salvar, apagar };
}
