"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Conversation } from "@/lib/types/messaging";
import { invalidarListasDaConversa } from "@/hooks/inbox/cacheDasConversas";

interface ReleaseArgs {
  conversation_id: string;
}

export function useReleaseConversation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: ReleaseArgs) =>
      apiClient.post<{ data: Conversation }>(
        `/api/v1/conversations/${args.conversation_id}/release`,
        {},
      ),
    onError: (err, args) => {
      invalidarListasDaConversa(qc, args.conversation_id);
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      showApiError(err);
    },
    onSuccess: (_data, args) => {
      invalidarListasDaConversa(qc, args.conversation_id);
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
    },
  });
}
