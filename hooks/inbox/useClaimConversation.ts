"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Conversation } from "@/lib/types/messaging";
import { invalidarListasDaConversa } from "@/hooks/inbox/cacheDasConversas";

interface ClaimArgs {
  conversation_id: string;
  expected_assignee?: string | null;
}

export function useClaimConversation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: ClaimArgs) =>
      apiClient.post<{ data: Conversation }>(
        `/api/v1/conversations/${args.conversation_id}/claim`,
        { expected_assignee: args.expected_assignee ?? null },
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
