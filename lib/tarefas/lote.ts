/**
 * AÇÕES EM MASSA sobre tarefas — o contrato de `POST /api/v1/tasks/bulk`,
 * partilhado pela rota (validação) e pela tela (tipos).
 *
 * Teto de 50 por chamada, o mesmo da rota em lote do Funil: a tela vai em
 * BLOCOS (`emBlocos`) quando a seleção passa disso.
 *
 * "Adiar" leva o PRAZO de cada tarefa pronto (`itens`), e não um modo: a conta
 * de "amanhã às 9h" é do fuso de quem clicou (`lib/tarefas/adiar.ts`), e o
 * servidor não sabe qual é.
 */
import { z } from "zod";

import { PRIORIDADES_DA_TAREFA } from "@/lib/tarefas/tipos";

export const LOTE_MAXIMO_DE_TAREFAS = 50;

const ids = z
  .array(z.string().uuid())
  .min(1)
  .max(LOTE_MAXIMO_DE_TAREFAS)
  // Id repetido contaria duas vezes no "N concluídas" e auditaria em dobro.
  .refine((lista) => new Set(lista).size === lista.length, { message: "ids repetidos" });

export const loteDeTarefasSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), task_ids: ids }),
  z.object({ action: z.literal("delete"), task_ids: ids }),
  z.object({ action: z.literal("priority"), task_ids: ids, priority: z.enum(PRIORIDADES_DA_TAREFA) }),
  z.object({ action: z.literal("assign"), task_ids: ids, assigned_to: z.string().uuid().nullable() }),
  z.object({
    action: z.literal("postpone"),
    itens: z
      .array(z.object({ id: z.string().uuid(), due_date: z.string().datetime({ offset: true }) }))
      .min(1)
      .max(LOTE_MAXIMO_DE_TAREFAS)
      .refine((lista) => new Set(lista.map((i) => i.id)).size === lista.length, { message: "ids repetidos" }),
  }),
]);

export type LoteDeTarefas = z.infer<typeof loteDeTarefasSchema>;
export type AcaoDoLote = LoteDeTarefas["action"];

/** Os ids que um pedido toca, qualquer que seja a ação. */
export function idsDoLote(lote: LoteDeTarefas): string[] {
  return lote.action === "postpone" ? lote.itens.map((i) => i.id) : lote.task_ids;
}

export interface ResultadoDoLoteDeTarefas {
  /** Quantas o pedido de fato mudou (ou apagou). */
  feitas: number;
  /** Ids pedidos que não estão nesta organização ou que a pessoa não alcança. */
  ignoradas: string[];
}
