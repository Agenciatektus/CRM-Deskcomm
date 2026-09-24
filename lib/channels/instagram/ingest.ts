/**
 * A mensagem do Instagram vira conversa no Inbox.
 *
 * ─── O QUE CHEGA AQUI ──────────────────────────────────────────────────────
 *
 * Não é o webhook da Meta. É o reenvio da plataforma do cliente, que recebe da
 * Meta, responde 200 na hora e enfileira — porque entregar ao CRM na mesma
 * requisição faria um CRM fora do ar virar reentrega da Meta e, persistindo,
 * desabilitar a subscription. Um cliente com o CRM caído derrubaria a ingestão
 * de todos.
 *
 * O envelope é `{ tipo, provider_message_id, ad_id, evento }`, e quem o lê é
 * `lerEventoDoInstagram` — um parser PURO, sem banco, que já existia e já tinha
 * teste. Este arquivo é o que faltava entre ele e o Inbox.
 *
 * ─── A PORTA: A FONTE GOVERNA A ENTRADA ────────────────────────────────────
 *
 * Antes de gravar qualquer coisa, pergunta-se que funil aceita aquela fonte. Se
 * nenhum aceita, NADA acontece: nem contato, nem conversa, nem mensagem, nem
 * lead. É decisão de produto do Peterson, e é mais forte que um filtro de tela
 * — um filtro deixaria a conversa existir, o cliente pagando armazenamento, o
 * agente de IA vendo tudo e o contador de não lidas subindo por algo que
 * ninguém vai ler.
 *
 * ─── COMENTÁRIO APARECE E NÃO VIRA LEAD ────────────────────────────────────
 *
 * Quem comenta "que lindo" num post não pediu atendimento, e virar card
 * encheria o Kanban de ruído para o vendedor limpar na mão. Mas aparece no
 * Inbox, porque alguém precisa responder — pessoa ou IA — e o que não aparece
 * não é respondido. Isso só cabe porque conversa e lead são entidades separadas
 * neste schema: a diferença entre os dois é uma linha (`aplicarEfeitosPosEntrada`
 * roda para Direct e não roda para comentário).
 *
 * ─── O QUE "IGNORAR" SIGNIFICA, E POR QUE É 200 ────────────────────────────
 *
 * Recibo de leitura, evento de tipo desconhecido, payload que não interessa: o
 * parser devolve `ignorar`, e a rota responde 200. Responder erro faria a fila
 * da plataforma reentregar para sempre um evento que nunca vai ser processado —
 * e o recuo dela é de 1 a 25 minutos, então o estrago seria silencioso e
 * contínuo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerEventoDoInstagram, type MensagemDoInstagram } from "./evento";
import { fonteDaEntrada, funilQueAceita } from "@/lib/leads/fontes-do-funil";
import { marcarConversaComMensagem } from "../marcar-conversa";
import { aplicarEfeitosPosEntrada } from "../pos-entrada";
import type { InboundWebhookInput, InboundWebhookOutcome } from "../inbound";

/**
 * O contato do Instagram é ancorado no IGSID.
 *
 * NÃO reusa `fn_upsert_wa_contact`: aquela RPC ancora em telefone ou no id
 * opaco do WhatsApp, e nenhum dos dois existe aqui. Forçá-la criaria contato
 * sem âncora utilizável — e a segunda mensagem da MESMA pessoa viraria um
 * segundo cadastro.
 *
 * A corrida de duas entregas simultâneas é resolvida pelo índice único parcial
 * `contacts_instagram_igsid_key (organization_id, instagram_igsid) where
 * instagram_igsid is not null and is_merged_into is null`: o segundo insert
 * levanta 23505 e a gente relê. O `where is_merged_into is null` é o que deixa a
 * FUSÃO existir — o perdedor vira lápide, sai do índice, e o vencedor herda.
 *
 * ⚠️ A trigger `trg_identidade_de_instagram_e_do_sistema` RECUSA escrita de
 * `instagram_igsid` por sessão de gente. Esta função roda com o cliente de
 * SERVIÇO, onde `auth.uid()` é nulo e a trava deixa passar. Não tente abrir a
 * escotilha de GUC aqui: ela existe para a fusão de contatos, que precisa
 * escrever a coluna de dentro de uma sessão de usuário.
 */
async function upsertContatoDoInstagram(
  admin: SupabaseClient,
  organizationId: string,
  msg: MensagemDoInstagram,
): Promise<string | null> {
  const existente = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("instagram_igsid", msg.igsid)
    .is("is_merged_into", null)
    .maybeSingle();
  if (existente.data) {
    // O `@` muda quando a pessoa quer, então ele é atualizado; o IGSID, não.
    // `is null` no filtro seria errado aqui: o handle novo é mais verdadeiro
    // que o antigo, ao contrário do telefone, que alguém pode ter corrigido na
    // tela.
    if (msg.username) {
      await admin
        .from("contacts")
        .update({ instagram_username: msg.username })
        .eq("id", existente.data.id as string);
    }
    return existente.data.id as string;
  }

  const criado = await admin
    .from("contacts")
    .insert({
      organization_id: organizationId,
      instagram_igsid: msg.igsid,
      instagram_username: msg.username,
      // O `@` é o melhor nome que o Instagram dá: o Direct não manda nome
      // nenhum, e um contato sem rótulo apareceria como "Sem nome" na lista.
      name: msg.username ? `@${msg.username}` : null,
    })
    .select("id")
    .maybeSingle();

  if (criado.data) return criado.data.id as string;

  // 23505 = o índice único pegou a corrida. A outra entrega criou a linha entre
  // o nosso select e o nosso insert; reler é o desfecho certo, não erro.
  if (criado.error?.code === "23505") {
    const relido = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("instagram_igsid", msg.igsid)
      .is("is_merged_into", null)
      .maybeSingle();
    return (relido.data?.id as string) ?? null;
  }
  return null;
}

/**
 * Grava a mensagem. `duplicate` é desfecho esperado, não falha.
 *
 * A idempotência é do banco: `unique (organization_id, external_id)`. A fila da
 * plataforma reentrega o que não recebeu 200, então a MESMA mensagem chega mais
 * de uma vez por desenho — tratar isso como erro faria a rota devolver 500 e a
 * fila reentregar de novo, para sempre.
 */
async function inserirMensagem(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: string;
    contactId: string;
    channelSessionId: string;
    msg: MensagemDoInstagram;
  },
): Promise<string | "duplicate"> {
  const { msg } = input;
  const { data, error } = await admin
    .from("messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      channel_session_id: input.channelSessionId,
      external_id: msg.providerMessageId,
      direction: "inbound",
      // Nasceu de FORA do CRM. O default da coluna é `'crm'` e ele mentiria
      // aqui: as funções de fricção contam só `external_device`, e o filtro de
      // eco do próprio envio depende deste valor.
      sent_via: "external_device",
      status: "delivered",
      // Anexo do Instagram é ponteiro com validade curta e o CRM ainda não
      // busca os bytes — `image` prometeria uma miniatura que não carrega.
      // `text` com corpo nulo é honesto: a tela mostra o selo de anexo.
      type: "text",
      body: msg.texto,
      sent_at: msg.recebidaEm,
      // POR ONDE esta MENSAGEM entrou. A conversa guarda como ela NASCEU; aqui
      // fica o de cada linha, que é o que distingue o comentário da DM dentro
      // de um mesmo fio.
      metadata: {
        instagram_entrada: msg.entrada,
        ...(msg.temAnexo ? { instagram_tem_anexo: true } : {}),
        ...(msg.mediaId ? { instagram_media_id: msg.mediaId } : {}),
        ...(msg.adId ? { instagram_ad_id: msg.adId } : {}),
      },
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") return "duplicate";
  if (error || !data) {
    throw new Error(`instagram_ingest_insert_failed: ${error?.message ?? "sem id"}`);
  }
  return (data as { id: string }).id;
}

export async function instagramInbound(
  admin: SupabaseClient,
  input: InboundWebhookInput,
): Promise<InboundWebhookOutcome> {
  let corpo: unknown;
  try {
    corpo = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, code: "invalid_json", message: "corpo não é JSON" };
  }

  const leitura = lerEventoDoInstagram(corpo, new Date().toISOString());
  if (!leitura.ok) {
    // `contrato_violado` sobe como erro de contrato — num payload que passou
    // pelo HMAC, campo com tipo errado significa que o fio mudou, e isso quem
    // investiga precisa ver. `ignorar` é 200: evento que nunca será processado
    // não deve voltar pela fila para sempre.
    if (leitura.motivo === "contrato_violado") {
      return { ok: false, code: "contrato_violado", message: leitura.detalhe };
    }
    return { ok: true, body: { status: "ignored", reason: leitura.detalhe } };
  }
  const msg = leitura.mensagem;

  // ── A PORTA ──────────────────────────────────────────────────────────────
  const fonte = fonteDaEntrada("instagram", msg.entrada);
  if (!fonte) return { ok: true, body: { status: "ignored", reason: "entrada_sem_fonte" } };

  // Erro de consulta ESTOURA (é o que `funilQueAceita` faz de propósito): o
  // descarte aqui é definitivo, então "não consegui perguntar" nunca pode virar
  // "ninguém aceita". Estourando, a fila reentrega e a mensagem se salva.
  const pipelineId = await funilQueAceita(admin, input.session.organization_id, fonte);
  if (!pipelineId) {
    return { ok: true, body: { status: "ignored", reason: `fonte_nao_ativada:${fonte}` } };
  }

  const organizationId = input.session.organization_id;
  const channelSessionId = input.session.id;

  const contactId = await upsertContatoDoInstagram(admin, organizationId, msg);
  if (!contactId) return { ok: true, body: { status: "ignored", reason: "contato_nao_resolvido" } };

  const { data: convId, error: convErr } = await admin.rpc("fn_upsert_conversa_do_instagram", {
    p_org: organizationId,
    p_contact: contactId,
    p_session: channelSessionId,
    p_entrada: msg.conversa,
  });
  if (convErr || !convId) return { ok: true, body: { status: "ignored", reason: "conversa_nao_resolvida" } };
  const conversationId = convId as string;

  const messageId = await inserirMensagem(admin, {
    organizationId,
    conversationId,
    contactId,
    channelSessionId,
    msg,
  });
  if (messageId === "duplicate") return { ok: true, body: { status: "duplicate", conversationId } };

  // Carimba a conversa. Não é cosmético: `last_inbound_at` é a fonte da janela,
  // e sem esta chamada o selo diria "o cliente nunca escreveu" numa conversa em
  // que ele acabou de escrever, o contador de não lidas ficaria em zero com
  // mensagem nova, e o guardrail do agente trataria tudo como fechado.
  await marcarConversaComMensagem(admin, {
    organizationId,
    conversationId,
    direction: "inbound",
    // `preview` e string, nao `string | null`: a lista do Inbox precisa de
    // algo escrito. Anexo sem legenda vira o selo, que e o que o operador
    // veria no aplicativo.
    preview: msg.texto ?? (msg.temAnexo ? "[anexo]" : ""),
    at: msg.recebidaEm,
    canal: "instagram",
  });

  // ── A LINHA QUE SEPARA DIRECT DE COMENTÁRIO ──────────────────────────────
  //
  // Direct é pedido de atendimento e vira lead. Comentário não. Os dois
  // aparecem no Inbox — a conversa e a mensagem já estão gravadas acima, e é
  // isso que os torna respondíveis.
  if (msg.conversa === "direct") {
    await aplicarEfeitosPosEntrada(admin, {
      organizationId,
      contactId,
      conversationId,
      messageId,
      channelSessionId,
      texto: msg.texto,
      nomeDoContato: msg.username ? `@${msg.username}` : null,
      origem: "instagram_webhook",
      // O funil veio da FONTE, e não do `is_default`.
      pipelineId,
    });
  }

  return { ok: true, body: { status: "ingested", conversationId, messageId } };
}
