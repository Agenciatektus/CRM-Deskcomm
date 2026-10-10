/**
 * Edição e "apagar para todos" vindos do WhatsApp, aplicados na mensagem
 * ORIGINAL, com a conferência de AUTORIA que o próprio WhatsApp não faz por nós.
 *
 * ─── Por que conferir ───────────────────────────────────────────────────────
 *
 * O id da mensagem-alvo vem do CONTEÚDO do evento, escrito por quem o mandou.
 * Como o WhatsApp é cifrado de ponta a ponta, o servidor não confere se quem
 * edita é o autor: quem confere é o aplicativo de quem recebe — e aqui quem
 * recebe é o CRM. Sem esta guarda, um contato com cliente modificado reescrevia
 * no CRM uma mensagem que a EMPRESA mandou para ele ("R$ 500" vira "R$ 50"),
 * ou marcava como apagada a resposta do atendente. O webhook ser autenticado
 * não ajuda: o transporte entrega fielmente o que o contato mandou.
 *
 * Só se altera quando TUDO bate:
 *   1. mesma sessão de canal do evento;
 *   2. mesma direção (o contato só mexe no que ELE mandou, a linha só no que
 *      ELA mandou);
 *   3. mesma conversa: o chat do evento é o da conversa ou do contato da
 *      original.
 * E o UPDATE vai pelo `id` da linha conferida, nunca pelo id externo de novo.
 *
 * Divergência NÃO é erro: reentregar não muda o resultado, e um 500 faria o
 * transporte reenviar para sempre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalPhoneBR } from "./phone-variants";

export interface PedidoDeAlteracao {
  organizationId: string;
  channelSessionId: string;
  /** Quem altera: `inbound` = o contato; `outbound` = a própria linha. */
  direcao: "inbound" | "outbound";
  /** `external_id` da mensagem original. */
  alvo: string;
  /** O chat do evento, como o transporte o entregou. */
  chat: { jid: string | null; phone: string | null; lid: string | null };
  acao: "editar" | "apagar";
  /** Corpo novo, na edição. */
  texto?: string | null;
}

export type ResultadoDaAlteracao =
  | { aplicada: true; messageId: string; conversationId: string }
  | { aplicada: false; motivo: string };

interface Original {
  id: string;
  channel_session_id: string;
  direction: string;
  conversation_id: string;
  contact_id: string;
}

export async function aplicarAlteracaoDeMensagem(
  admin: SupabaseClient,
  pedido: PedidoDeAlteracao,
): Promise<ResultadoDaAlteracao> {
  const { data, error } = await admin
    .from("messages")
    .select("id, channel_session_id, direction, conversation_id, contact_id")
    .eq("organization_id", pedido.organizationId)
    .eq("external_id", pedido.alvo)
    .maybeSingle();
  // Falha de banco SOBE: o transporte reenvia e a alteração não se perde.
  if (error) throw new Error(`alteracao_leitura_falhou: ${error.message}`);
  const original = data as Original | null;
  if (!original) return { aplicada: false, motivo: `${pedido.acao}_sem_original` };

  if (original.channel_session_id !== pedido.channelSessionId || original.direction !== pedido.direcao) {
    return { aplicada: false, motivo: "alteracao_autor_divergente" };
  }
  if (!(await mesmaConversa(admin, original, pedido.chat))) {
    return { aplicada: false, motivo: "alteracao_conversa_divergente" };
  }

  const agora = new Date().toISOString();
  const patch = pedido.acao === "editar"
    // Edição sem corpo novo carimba, mas não ZERA o texto: trocar a versão
    // velha (útil) por vazio (inútil) é pior que não aplicar.
    ? { ...(pedido.texto ? { body: pedido.texto } : {}), edited_at: agora }
    : { revoked_at: agora };

  const { error: erroUpdate } = await admin
    .from("messages")
    .update(patch)
    .eq("id", original.id)
    .eq("organization_id", pedido.organizationId);
  if (erroUpdate) throw new Error(`alteracao_update_falhou: ${erroUpdate.message}`);

  return { aplicada: true, messageId: original.id, conversationId: original.conversation_id };
}

/**
 * O chat do evento é o da original? Pelo endereço da conversa (o JID que o
 * transporte gravou) ou pela identidade do contato (telefone canônico ou LID).
 * Sem nada com que comparar, a resposta é NÃO: falha fechado.
 */
async function mesmaConversa(
  admin: SupabaseClient,
  original: Original,
  chat: PedidoDeAlteracao["chat"],
): Promise<boolean> {
  if (chat.jid) {
    const { data } = await admin
      .from("conversations")
      .select("provider_conversation_id")
      .eq("id", original.conversation_id)
      .maybeSingle();
    const endereco = (data as { provider_conversation_id: string | null } | null)?.provider_conversation_id;
    if (endereco && endereco === chat.jid) return true;
  }
  if (!chat.phone && !chat.lid) return false;

  const { data } = await admin
    .from("contacts")
    .select("phone_number, wa_lid")
    .eq("id", original.contact_id)
    .maybeSingle();
  const contato = data as { phone_number: string | null; wa_lid: string | null } | null;
  if (!contato) return false;
  if (chat.phone && contato.phone_number && canonicalPhoneBR(chat.phone) === contato.phone_number) return true;
  if (chat.lid && contato.wa_lid && chat.lid === contato.wa_lid) return true;
  return false;
}
