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
 * - LOTE COM LIMITE: até `LIMITE_DO_LOTE` de cada por chamada; `restam` avisa que há
 *   mais, e o cliente chama de novo. IDEMPOTENTE: zerar o que já é zero e limpar o
 *   que já é nulo não muda nada.
 * - SEM "VISTO" NO WHATSAPP: a ação individual (`POST /conversations/[id]/mark-read`)
 *   também não envia confirmação de leitura ao cliente (ela só zera o contador), e o
 *   lote segue a mesma regra. Este módulo não chama canal nenhum; o teste
 *   `tests/unit/marcar-todas-lidas.test.ts` prende isso.
 */
export const LIMITE_DO_LOTE = 500;

type SB = SupabaseClient;

export interface ResultadoDoLote {
  contadores: number;
  marcas: number;
  restam: boolean;
}

export async function marcarTodasComoLidas(
  supabase: SB,
  alvo: { orgId: string; userId: string },
): Promise<ResultadoDoLote> {
  const { orgId, userId } = alvo;

  const { data: minhas, error: erroDasMinhas } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("assigned_to_user_id", userId)
    .gt("unread_count_for_assignee", 0)
    .limit(LIMITE_DO_LOTE + 1);
  if (erroDasMinhas) throw new Error(erroDasMinhas.message);
  const idsDasMinhas = (minhas ?? []).slice(0, LIMITE_DO_LOTE).map((c: { id: string }) => c.id);
  if (idsDasMinhas.length > 0) {
    const { error } = await supabase
      .from("conversations")
      .update({ unread_count_for_assignee: 0 })
      .eq("organization_id", orgId)
      .eq("assigned_to_user_id", userId)
      .in("id", idsDasMinhas);
    if (error) throw new Error(error.message);
  }

  const { data: marcadas, error: erroDasMarcas } = await supabase
    .from("conversation_user_state")
    .select("conversation_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .not("marked_unread_at", "is", null)
    .limit(LIMITE_DO_LOTE + 1);
  if (erroDasMarcas) throw new Error(erroDasMarcas.message);
  const idsDasMarcas = (marcadas ?? [])
    .slice(0, LIMITE_DO_LOTE)
    .map((m: { conversation_id: string }) => m.conversation_id);
  if (idsDasMarcas.length > 0) {
    const { error } = await supabase
      .from("conversation_user_state")
      .update({ marked_unread_at: null, updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .in("conversation_id", idsDasMarcas);
    if (error) throw new Error(error.message);
  }

  return {
    contadores: idsDasMinhas.length,
    marcas: idsDasMarcas.length,
    restam: (minhas ?? []).length > LIMITE_DO_LOTE || (marcadas ?? []).length > LIMITE_DO_LOTE,
  };
}
