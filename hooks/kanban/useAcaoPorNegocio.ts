"use client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { liberarEcoLocal, marcarEcoLocal } from "@/lib/kanban/local-echo";
import { porNegocio, resumoDasFalhas, type ResultadoDoLote } from "@/lib/kanban/lote-por-negocio";

/**
 * Roda uma ação da barra em lote negócio a negócio, pela rota individual
 * (`lib/kanban/lote-por-negocio.ts`), e diz no fim quantos deram certo e, dos
 * que falharam, quantos e por quê. Os que deram certo ficam.
 */
export function useAcaoPorNegocio(pipelineId: string) {
  const qc = useQueryClient();
  const t = useT();
  return async (
    ids: string[],
    fazer: (id: string) => Promise<unknown>,
    sucesso: (n: number) => string,
  ): Promise<ResultadoDoLote> => {
    for (const id of ids) marcarEcoLocal(id);
    let resultado: ResultadoDoLote;
    try {
      resultado = await porNegocio(ids, fazer);
    } finally {
      for (const id of ids) liberarEcoLocal(id);
      void qc.invalidateQueries({ queryKey: ["board", pipelineId] });
    }
    const { feitos, falhas } = resultado;
    if (falhas.length === 0) {
      toast.success(sucesso(feitos.length));
    } else {
      toast.warning(
        `${sucesso(feitos.length)} ${falhas.length} ${t(falhas.length > 1 ? "não foram:" : "não foi:")} ${resumoDasFalhas(falhas)}`,
      );
    }
    return resultado;
  };
}
