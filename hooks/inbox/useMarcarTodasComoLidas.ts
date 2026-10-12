"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { ResultadoDoLote } from "@/lib/inbox/marcar-todas-lidas";

/** Teto de lotes por clique: 10 × 500. Acima disso, o resto fica para o próximo. */
const LOTES_POR_CLIQUE = 10;

/**
 * "Marcar todas como lidas" (⋮ da lista no celular). Chama a rota em lote até ela
 * dizer que não restam (ou até o teto), e atualiza a lista e os contadores.
 * O servidor decide quais conversas entram; nada vai do cliente além do pedido.
 */
export function useMarcarTodasComoLidas(t: (texto: string) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      let total = 0;
      for (let i = 0; i < LOTES_POR_CLIQUE; i += 1) {
        const r = await apiClient.post<{ data: ResultadoDoLote }>("/api/v1/conversations/mark-all-read", {});
        total += r.data.contadores + r.data.marcas;
        if (!r.data.restam) break;
      }
      return total;
    },
    onError: showApiError,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["conversation-counts"] });
      toast(t("Todas marcadas como lidas."));
    },
  });
}
