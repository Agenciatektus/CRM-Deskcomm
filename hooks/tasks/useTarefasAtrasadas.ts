"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";

/**
 * Quantas tarefas venceram na mão de quem está logado: o número ao lado de
 * "Tarefas" no menu (S14). Uma contagem barata no banco
 * (`GET /api/v1/tasks/atrasadas`, migration 9047), não a lista.
 *
 * A chave começa com `["crm_tasks"]`, a mesma de `useTasks` e do painel: criar,
 * concluir ou reagendar uma tarefa em qualquer tela invalida o número junto. O
 * intervalo de 60 s cobre o que vence sem ninguém mexer (uma tarefa passa da
 * hora sozinha).
 */
export function useTarefasAtrasadas() {
  const { activeOrg } = useAuth();
  const orgId = activeOrg?.orgId ?? null;
  return useQuery({
    queryKey: ["crm_tasks", "atrasadas", orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => apiClient.get<{ data: { atrasadas: number } }>("/api/v1/tasks/atrasadas"),
    select: (r) => (typeof r?.data?.atrasadas === "number" ? r.data.atrasadas : 0),
  });
}
