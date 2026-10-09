"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { Contact } from "@/lib/types/contacts";

/**
 * Bloqueia o contato pela equipe (agent+), o simétrico de `useUnblockContact`:
 * `POST /api/v1/contacts/[id]/block` com motivo opcional. Invalida as MESMAS
 * chaves, pelo mesmo motivo (o Inbox lê o contato por `conversation.contacts`).
 */
export function useBlockContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, motivo }: { contactId: string; motivo?: string }) =>
      apiClient.post<{ data: Contact }>(`/api/v1/contacts/${contactId}/block`, motivo ? { motivo } : {}),
    onError: showApiError,
    onSuccess: (_d, { contactId }) => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
