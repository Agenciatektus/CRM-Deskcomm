import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "MARCAR TODAS COMO LIDAS" (o ⋮ da lista de conversas no celular, M2.1).
 *
 * Regras (parecer do @Cassio_SecRev na #173):
 * - QUEM ENTRA, o servidor decide: nenhuma lista de ids vem do cliente. O cliente
 *   recebido é o do USUÁRIO (RLS de `conversations` e `conversation_user_state`): só
 *   o que o papel dele enxerga, sempre filtrado pela organização ativa.
 * - SÓ O ESTADO DE LEITURA DO PRÓPRIO ATENDENTE:
 *   1. o contador `unread_count_for_assignee` é de quem ATENDE a conversa, então só
 *      as conversas atribuídas a ele são zeradas (as da fila e as dos colegas, não:
 *      zerá-las apagaria o "não lido" de outra pessoa);
 *   2. a marca pessoal "não lida" (`conversation_user_state.marked_unread_at`, 9042)
 *      é limpa só nas linhas dele.
 * - PELO FILTRO, SEM LISTA DE IDS (P1 do Cassio na #178): o UPDATE leva só os filtros
 *   (organização, dono ou usuário, e "não lida"). Uma lista de ids em `.in()` iria na
 *   URL do PostgREST, e 500 uuids passam de 18 KB: é o defeito conhecido do CRM de
 *   consulta que estoura a URL. Pelo filtro, a URL tem tamanho fixo.
 * - CONTA O QUE MUDOU: `count: "exact"` no próprio UPDATE devolve as linhas
 *   REALMENTE atualizadas (RLS e corrida inclusas), e é esse número que volta.
 *   IDEMPOTENTE: rodar de novo encontra zero e não muda nada.
 * - SEM "VISTO" NO WHATSAPP: a ação individual (`POST /conversations/[id]/mark-read`)
 *   também não envia confirmação de leitura ao cliente (ela só zera o contador), e o
 *   lote segue a mesma regra. Este módulo não chama canal nenhum; o teste
 *   `tests/unit/marcar-todas-lidas.test.ts` prende isso.
 */
type SB = SupabaseClient;

export interface ResultadoDoLote {
  contadores: number;
  marcas: number;
}

export async function marcarTodasComoLidas(
  supabase: SB,
  alvo: { orgId: string; userId: string },
): Promise<ResultadoDoLote> {
  const { orgId, userId } = alvo;

  const contadores = await supabase
    .from("conversations")
    .update({ unread_count_for_assignee: 0 }, { count: "exact" })
    .eq("organization_id", orgId)
    .eq("assigned_to_user_id", userId)
    .gt("unread_count_for_assignee", 0);
  if (contadores.error) throw new Error(contadores.error.message);

  const marcas = await supabase
    .from("conversation_user_state")
    .update({ marked_unread_at: null, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .not("marked_unread_at", "is", null);
  if (marcas.error) throw new Error(marcas.error.message);

  return { contadores: contadores.count ?? 0, marcas: marcas.count ?? 0 };
}
