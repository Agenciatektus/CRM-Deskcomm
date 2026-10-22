"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { agendarNoLote, useLoteOcupado } from "@/hooks/kanban/useAcaoPorNegocio";
import { apiClient } from "@/lib/api/client";
import {
  LOTE_MAXIMO_DE_TAREFAS,
  type LoteDeTarefas,
  type ResultadoDoLoteDeTarefas,
} from "@/lib/tarefas/lote";

/**
 * As ações em massa da tela de Tarefas (`POST /api/v1/tasks/bulk`), com a
 * MESMA trava do lote do Funil: `agendarNoLote` segura a barra nos 5 s do
 * Desfazer e enquanto os blocos saem, e recusa uma segunda ação por cima
 * (o duplo clique que agendaria a mesma coisa duas vezes). A chave é própria
 * ("tarefas"), para o lote do Funil e o daqui não se travarem um ao outro.
 */
export const CHAVE_DO_LOTE_DE_TAREFAS = "tarefas";

/** O aviso de quando a trava recusa (texto para `t()`). */
export const AVISO_DE_LOTE_DE_TAREFAS_EM_CURSO =
  "Já há uma ação em lote em curso nas tarefas. Espere terminar ou clique em Desfazer antes de começar outra.";

/** Quebra o pedido em blocos de 50 (o teto da rota), mantendo a ação. */
export function blocosDoLote(lote: LoteDeTarefas): LoteDeTarefas[] {
  const blocos: LoteDeTarefas[] = [];
  if (lote.action === "postpone") {
    for (let i = 0; i < lote.itens.length; i += LOTE_MAXIMO_DE_TAREFAS) {
      blocos.push({ ...lote, itens: lote.itens.slice(i, i + LOTE_MAXIMO_DE_TAREFAS) });
    }
    return blocos;
  }
  for (let i = 0; i < lote.task_ids.length; i += LOTE_MAXIMO_DE_TAREFAS) {
    blocos.push({ ...lote, task_ids: lote.task_ids.slice(i, i + LOTE_MAXIMO_DE_TAREFAS) });
  }
  return blocos;
}

export function useLoteDeTarefas() {
  const qc = useQueryClient();
  const t = useT();
  const travado = useLoteOcupado(CHAVE_DO_LOTE_DE_TAREFAS);
  // A trava do apagar é um REF: o estado só muda no render seguinte, e dois
  // cliques no mesmo quadro passariam os dois pelo `if`. O estado fica só para
  // a tela desenhar o botão travado.
  const apagandoRef = useRef(false);
  const [apagando, setApagando] = useState(false);

  const invalidar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["crm_tasks"] }),
      // O card do quadro mostra o próximo passo e o selo das tarefas, e a Inbox
      // a pílula do passo: as mesmas chaves que `useTasks` invalida.
      qc.invalidateQueries({ queryKey: ["board"] }),
      qc.invalidateQueries({ queryKey: ["conversations"] }),
    ]);

  /** Em sequência, bloco a bloco; a soma é do que o BANCO devolveu como feito. */
  async function enviar(lote: LoteDeTarefas): Promise<ResultadoDoLoteDeTarefas> {
    const total: ResultadoDoLoteDeTarefas = { feitas: 0, ignoradas: [] };
    try {
      for (const bloco of blocosDoLote(lote)) {
        const res = await apiClient.post<{ data: ResultadoDoLoteDeTarefas }>("/api/v1/tasks/bulk", bloco);
        total.feitas += res.data.feitas;
        total.ignoradas.push(...res.data.ignoradas);
      }
    } finally {
      await invalidar();
    }
    return total;
  }

  function avisarResultado(r: ResultadoDoLoteDeTarefas, sucesso: (n: number) => string) {
    if (r.ignoradas.length === 0) toast.success(sucesso(r.feitas));
    else
      toast.warning(
        `${sucesso(r.feitas)} ${r.ignoradas.length} ${t(r.ignoradas.length === 1 ? "não pôde ser alterada (apagada ou fora do seu alcance)." : "não puderam ser alteradas (apagadas ou fora do seu alcance).")}`,
      );
  }

  /**
   * Agenda com Desfazer de 5 s. Devolve `false` (e avisa) quando já há uma
   * ação do lote em curso: a tela mantém a seleção.
   */
  function agendar(
    mensagem: string,
    lote: LoteDeTarefas,
    sucesso: (n: number) => string,
    aoDesfazer?: () => void,
  ): boolean {
    const agendado = agendarNoLote(
      CHAVE_DO_LOTE_DE_TAREFAS,
      (s) => `${mensagem} (${s} s)`,
      t("Desfazer"),
      async () => avisarResultado(await enviar(lote), sucesso),
      aoDesfazer,
    );
    if (!agendado) toast.warning(t(AVISO_DE_LOTE_DE_TAREFAS_EM_CURSO));
    return agendado;
  }

  /** Apagar não tem Desfazer (a linha some de verdade): vem depois da confirmação. */
  async function apagar(ids: string[], sucesso: (n: number) => string): Promise<boolean> {
    if (apagandoRef.current || travado) return false;
    apagandoRef.current = true;
    setApagando(true);
    try {
      avisarResultado(await enviar({ action: "delete", task_ids: ids }), sucesso);
      return true;
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : t("Não foi possível apagar a tarefa."));
      return false;
    } finally {
      apagandoRef.current = false;
      setApagando(false);
    }
  }

  return { ocupado: travado || apagando, agendar, apagar };
}
