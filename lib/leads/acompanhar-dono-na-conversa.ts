/**
 * Trocou o dono do lead => a conversa do contato passa para o mesmo atendente.
 *
 * O Inbox "Minhas" lê `conversations.assigned_to_user_id`; sem isto o atendente
 * novo não via o lead como dele. Só humano propaga (dono null ou agente de IA
 * não mexe), e só conversa reivindicada que JÁ tem humano (`assignee_kind='user'`).
 * Conversa aberta sem responsável (assignee_kind nulo) é a que a IA atende: a RPC
 * a silenciaria (`bot_silenced_until=infinity`), então NÃO se move. Conversa com IA
 * idem: passar da IA é decisão humana. Quem grava é `fn_conversation_assign`
 * (nome denormalizado, evento, bot silenciado) — nunca UPDATE direto.
 *
 * Falha NÃO desfaz a troca do dono do lead: loga e segue. Conversa fora da
 * visibilidade de quem chama volta com 0 linhas da RPC = "não movida", sem erro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export async function acompanharDonoNaConversa(
  client: SupabaseClient,
  args: { organizationId: string; leadId?: string; contactIds: Array<string | null | undefined>; novoDonoUserId: string | null | undefined },
): Promise<number> {
  const { organizationId, novoDonoUserId } = args;
  const contactIds = Array.from(new Set(args.contactIds.filter((c): c is string => !!c)));
  if (!novoDonoUserId || contactIds.length === 0) return 0;

  let movidas = 0;
  try {
    const { data, error } = await client
      .from("conversations")
      .select("id, assigned_to_user_id")
      .eq("organization_id", organizationId)
      .in("contact_id", contactIds)
      .in("status", ["open", "claimed"])
      .eq("assignee_kind", "user");
    if (error) throw new Error(error.message);

    for (const conversa of data ?? []) {
      const atual = (conversa.assigned_to_user_id as string | null) ?? null;
      if (atual === novoDonoUserId) continue;
      const { data: linhas, error: rpcErr } = await client.rpc("fn_conversation_assign", {
        p_organization_id: organizationId,
        p_conversation_id: conversa.id as string,
        p_to_user_id: novoDonoUserId,
        p_reason: "transfer",
        // `?? undefined`: a RPC espera uuid, e null no optimistic lock vira "sem responsável".
        p_expected_assignee: atual ?? undefined,
        p_enforce_expected: true,
      });
      if (rpcErr) {
        logger.warn("leads.dono: conversa não acompanhou o novo dono", {
          organizationId,
          leadId: args.leadId,
          contactIds,
          conversationId: conversa.id,
          erro: rpcErr.message,
        });
        continue;
      }
      // shortcut: não emite `conversation.transferred` nem audit como a rota de transfer;
      // atualizar se o histórico da conversa precisar mostrar quem trocou o dono do lead.
      if (Array.isArray(linhas) && linhas.length > 0) movidas += 1;
    }
  } catch (erro) {
    logger.warn("leads.dono: falha ao acompanhar o dono na conversa", {
      organizationId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
  }
  return movidas;
}
