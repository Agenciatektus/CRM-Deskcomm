"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { ResultadoDoLote } from "@/lib/inbox/marcar-todas-lidas";

/**
 * "Marcar todas como lidas" (⋮ da lista no celular). Uma chamada: o servidor atualiza
 * pelo filtro e devolve quantas linhas REALMENTE mudaram. Só com mudança o aviso diz
 * que marcou; com zero, diz que não havia o que marcar (P2 do Cassio na #178).
 */
export function useMarcarTodasComoLidas(t: (texto: string) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await apiClient.post<{ data: ResultadoDoLote }>("/api/v1/conversations/mark-all-read", {});
      return r.data.contadores + r.data.marcas;
    },
    onError: showApiError,
    onSuccess: (mudaram) => {
      if (mudaram > 0) {
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        void qc.invalidateQueries({ queryKey: ["conversation-counts"] });
        toast(t("Todas marcadas como lidas."));
      } else {
        toast(t("Nenhuma conversa sua estava como não lida."));
      }
    },
  });
}
