"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { EdicaoDaTarefa, NovaTarefa, Tarefa } from "@/lib/tarefas/tipos";

/**
 * As tarefas ABERTAS do contato, para o "Próximo passo" do painel.
 *
 * Por `contact_id`, e não pelos negócios: toda tarefa que nasce presa a um
 * negócio herda o contato dele (`lib/tarefas/criar-tarefa.ts`), e a tela de
 * Tarefas também grava o contato. Perguntar por negócio pediria uma leitura por
 * lead e ainda deixaria de fora a tarefa solta do contato.
 *
 * A chave começa com `["crm_tasks"]`, a mesma de `hooks/tasks/useTasks.ts`: o
 * que a tela de Tarefas cria ou conclui invalida este painel, e vice-versa.
 *
 * Pelo `apiClient`, e não `fetch` cru como o `useTasks`: o cliente já traduz o
 * envelope de erro em `ApiError`, que é o que `showApiError` sabe mostrar.
 */
const CHAVE = ["crm_tasks"] as const;

export function useTarefasDoContato(contactId: string | null) {
  const qc = useQueryClient();

  const lista = useQuery({
    queryKey: [...CHAVE, "contato", contactId],
    enabled: !!contactId,
    staleTime: 10_000,
    queryFn: () =>
      apiClient.get<{ data: { tasks: Tarefa[] } }>(
        `/api/v1/tasks?contact_id=${encodeURIComponent(contactId ?? "")}&aberto=true`,
      ),
    // A rota já ordena por prazo (sem prazo por último). Resposta fora do
    // contrato vira lista vazia em vez de derrubar o painel.
    select: (r) => (Array.isArray(r?.data?.tasks) ? r.data.tasks : []),
  });

  // A lista da Inbox também: a pílula "Sem próximo passo" / "Tarefa atrasada" e
  // o filtro saem do banco (`passo_da_conversa`, migration 9047), e criar ou
  // concluir a tarefa aqui muda os dois.
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["conversations"] });
    return qc.invalidateQueries({ queryKey: CHAVE });
  };

  const criar = useMutation({
    mutationFn: (entrada: NovaTarefa) => apiClient.post<{ data: { task: Tarefa } }>("/api/v1/tasks", entrada),
    onError: showApiError,
    onSettled: invalidar,
  });

  const editar = useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: EdicaoDaTarefa }) =>
      apiClient.patch<{ data: { task: Tarefa } }>(`/api/v1/tasks/${id}`, entrada),
    onError: showApiError,
    onSettled: invalidar,
  });

  return { lista, criar, editar };
}
