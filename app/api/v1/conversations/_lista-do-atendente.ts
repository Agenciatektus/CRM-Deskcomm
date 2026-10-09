/**
 * A lista da Inbox COM o estado de quem pede (migration 9042): fixadas no topo
 * da aba, e cada conversa com `pinned`, `muted_until` e `marked_unread`.
 *
 * Fica fora de `_handler.ts` pelo mesmo motivo do nome do atendente: aquele
 * handler é compartilhado com as tools MCP, que não têm "pessoa da sessão".
 *
 * ─── Sem N+1, e o cursor continua valendo ──────────────────────────────────
 *
 * Por requisição, um número FIXO de consultas, nunca uma por conversa:
 *
 *   1. o recorte da pessoa (`lerRecorteDoAtendente`): as linhas ativas dela na
 *      organização, que já trazem o estado de toda conversa que tem algum;
 *   2. a página, com as fixadas EXCLUÍDAS (`excetoIds`) — o cursor pagina só o
 *      resto, na ordem de sempre, e nenhuma fixada aparece duas vezes;
 *   3. só na primeira página: as fixadas, com os MESMOS filtros da aba
 *      (`somenteIds`), que vão para o topo. Fixada que não pertence à aba não
 *      aparece nela.
 *
 * Conversa sem linha no recorte = nada fixado, silenciado ou marcado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { HandlerCtx } from "@/lib/api/handlers/types";
import { fixadasNoTopo } from "@/lib/inbox/estado-por-atendente";
import { comEstadoPessoal, lerRecorteDoAtendente } from "@/lib/inbox/estado-por-atendente.servidor";
import type { ListConversationsQuery } from "@/lib/schemas";

import { listConversationsHandler, type ListConversationsResult } from "./_handler";

export async function listarParaOAtendente(
  supabase: SupabaseClient,
  ctx: HandlerCtx,
  q: ListConversationsQuery,
  userId: string,
) {
  const recorte = await lerRecorteDoAtendente(supabase, ctx.organization_id, userId);
  const { fixadas, marcadas, estados } = recorte;

  const pagina: ListConversationsResult = await listConversationsHandler(supabase, ctx, q, {
    excetoIds: fixadas,
    naoLidasExtras: marcadas,
  });

  let topo: ListConversationsResult["conversations"] = [];
  if (!q.cursor && fixadas.length > 0) {
    const r = await listConversationsHandler(
      supabase,
      ctx,
      { ...q, cursor: undefined, limit: fixadas.length },
      { somenteIds: fixadas, naoLidasExtras: marcadas },
    );
    topo = fixadasNoTopo(r.conversations, fixadas);
  }

  return {
    conversations: comEstadoPessoal([...topo, ...pagina.conversations], estados),
    cursor: pagina.cursor,
    has_more: pagina.has_more,
  };
}
