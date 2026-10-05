"use client";
import { useActiveOrg, usePermission } from "@/hooks/auth/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Note } from "@/lib/types/messaging";

/** Onda 5.2: notas internas da conversa (poucas por conversa — query simples, sem paginação). */
export function useConversationNotes(conversationId: string | null) {
  const podeConsultar = usePermission("inbox.notes.view");
  const qc = useQueryClient();
  const queryKey = ["notes", conversationId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!conversationId && podeConsultar,
    queryFn: async () => {
      try {
        return await apiClient.get<{ data: Note[] }>(
          `/api/v1/conversations/${conversationId}/notes`,
        );
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    select: (res) => res.data,
  });

  const onChange = useCallback(() => {
    if (conversationId) qc.invalidateQueries({ queryKey: ["notes", conversationId] });
  }, [qc, conversationId]);

  // O canal é o das notas da ORGANIZAÇÃO, o mesmo que o aviso de menção
  // (`useCrmAlerts`) já mantém aberto em toda tela: um canal a menos por
  // conversa aberta. O recorte para ESTA conversa é local; DELETE (que sob RLS
  // só traz o id) passa, e custa no máximo um refetch das notas.
  // Sem organização ativa, o canal estreito de antes.
  const orgId = useActiveOrg()?.orgId ?? null;
  const filtroLocal = useMemo(
    () => (conversationId ? { campos: { conversation_id: conversationId } } : undefined),
    [conversationId],
  );
  useRealtimeChannel({
    name: conversationId ? `conversation-notes-${conversationId}` : "conversation-notes-disabled",
    postgresChanges: conversationId
      ? {
          event: "*",
          schema: "public",
          table: "conversation_notes",
          filter: orgId ? `organization_id=eq.${orgId}` : `conversation_id=eq.${conversationId}`,
        }
      : undefined,
    filtroLocal,
    onChange,
    enabled: !!conversationId && podeConsultar,
  });

  return query.data ?? [];
}
