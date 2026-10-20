"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { liberarEcoLocal, marcarEcoLocal } from "@/lib/kanban/local-echo";
import { porNegocio, resumoDasFalhas, type ResultadoDoLote } from "@/lib/kanban/lote-por-negocio";
import { acaoPendente, adiarAcao, useAcaoPendente } from "@/lib/ui/aviso-com-desfazer";

/**
 * A TRAVA do lote negócio a negócio (P2 do Cassio na #220): uma chave por funil
 * segura a barra durante os 5 s do Desfazer (`adiarAcao` com `chave`) e o
 * contador `rodando` a segura enquanto as chamadas saem. Sem ela, reconfirmar
 * dentro da janela agendava a mesma tarefa de novo, para os mesmos negócios.
 */
export const chaveDoLote = (pipelineId: string) => `lote-do-funil:${pipelineId}`;

let rodando = 0;
const ouvintes = new Set<() => void>();
const avisar = () => {
  for (const o of ouvintes) o();
};
const assinar = (o: () => void) => {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
};

/** `true` enquanto uma ação do lote está nos 5 s do Desfazer ou rodando. */
export function useLoteOcupado(pipelineId: string): boolean {
  const pendente = useAcaoPendente(chaveDoLote(pipelineId));
  const emCurso = useSyncExternalStore(assinar, () => rodando > 0, () => false);
  return pendente || emCurso;
}

/** Agenda no lote; recusa (devolve `false`) se já há uma ação do lote em curso. */
export function agendarNoLote(
  pipelineId: string,
  mensagem: (s: number) => string,
  rotuloDoDesfazer: string,
  executar: () => Promise<unknown>,
): boolean {
  const chave = chaveDoLote(pipelineId);
  if (acaoPendente(chave) || rodando > 0) return false;
  adiarAcao(mensagem, rotuloDoDesfazer, executar, undefined, { chave });
  return true;
}

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
    rodando += 1;
    avisar();
    let resultado: ResultadoDoLote;
    try {
      resultado = await porNegocio(ids, fazer);
    } finally {
      rodando -= 1;
      avisar();
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
