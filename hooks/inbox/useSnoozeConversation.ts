"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { invalidarListasDaConversa } from "@/hooks/inbox/cacheDasConversas";

/**
 * Duração redonda (contrato antigo) OU o instante exato que a tela calculou no
 * fuso de quem clica. A rota aceita as duas formas (`lib/schemas/snooze.ts`).
 */
type SnoozeArgs =
  | { conversation_id: string; duration_hours: 1 | 3 | 24 }
  | { conversation_id: string; snooze_until: string };

interface CancelArgs {
  conversation_id: string;
}

export function useSnoozeConversation() {
  const qc = useQueryClient();

  const invalidate = (conversationId: string) => {
    invalidarListasDaConversa(qc, conversationId);
    qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
  };

  const snooze = useMutation({
    mutationFn: async (args: SnoozeArgs) =>
      apiClient.post<{ data: { snooze_until: string } }>(
        `/api/v1/conversations/${args.conversation_id}/snooze`,
        "snooze_until" in args
          ? { snooze_until: args.snooze_until }
          : { duration_hours: args.duration_hours },
      ),
    onError: showApiError,
    onSuccess: (_data, args) => invalidate(args.conversation_id),
  });

  const cancel = useMutation({
    mutationFn: async (args: CancelArgs) =>
      apiClient.delete<void>(`/api/v1/conversations/${args.conversation_id}/snooze`),
    onError: showApiError,
    onSuccess: (_data, args) => invalidate(args.conversation_id),
  });

  return { snooze, cancel };
}
