/**
 * Ingestão do canal Verdash: webhook → contato, conversa, mensagem.
 *
 * A leitura do payload é do módulo puro ao lado (`./webhook.ts`); aqui moram os
 * EFEITOS.
 *
 * ─── Por que este canal TAMBÉM grava a thread ───────────────────────────────
 *
 * A primeira versão não gravava `provider_conversation_id`, com o argumento de
 * que aqui o endereço é o telefone e se deriva do contato. **Estava errado, e o
 * erro apareceu em produção no segundo dia.**
 *
 * Dois motivos, e o segundo é o que quebra de verdade:
 *
 * 1. Em LID mode (a Hidden Number Migration do WhatsApp), o chat NÃO é um
 *    telefone: chega como `162379946016868@lid`. Reconstruir um telefone para
 *    responder é inventar um endereço que o servidor não conhece.
 *
 * 2. O telefone que guardamos passa por `canonicalPhoneBR`, que escolhe a
 *    variante MAIS LONGA — isto é, ACRESCENTA o nono dígito. É a convenção de
 *    armazenamento do repo e está certa para o cadastro. Só que uma linha antiga
 *    é conhecida pelo WhatsApp SEM o nono dígito, e aí o que gravamos deixa de
 *    ser um endereço válido:
 *
 *      SenderAlt do webhook : 556684057837@s.whatsapp.net   (12 dígitos)
 *      contato no CRM       : +5566984057837                (13, canônico)
 *      envio                : 500 "no LID found for 5566984057837@s.whatsapp.net"
 *
 * O JID do chat não tem esses dois problemas: é o endereço que o próprio
 * servidor usou para nos entregar a mensagem. Guardá-lo é guardar a resposta
 * em vez de recalculá-la — e recalcular, aqui, dá errado.
 *
 * ─── Idempotência ───────────────────────────────────────────────────────────
 *
 * O FZAP reentrega o que não recebeu 200, e reentrega o MESMO evento. A chave é
 * `(organization_id, external_id)` no INSERT, com captura do `23505` — igual aos
 * dois canais irmãos. Sem isso, uma retentativa duplica a mensagem no inbox.
 *
 * ─── A mídia tem relógio correndo ───────────────────────────────────────────
 *
 * A URL que o FZAP resolve expira em ~30 minutos. O `emit_event` de persistência
 * é disparado na mesma requisição justamente por isso: o worker precisa baixar
 * os bytes ENQUANTO a URL vale. Adiar isso para um cron significaria mídia
 * perdida — e, diferente de quase tudo, mídia perdida não se recupera depois: o
 * FZAP não guarda o arquivo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { pausarIaPorAtendimentoManual } from "@/lib/escalacao/atendimento-manual";

import { aplicarEfeitosPosEntrada } from "../pos-entrada";

import { parseVerdashInbound, type VerdashInboundMessage } from "./webhook";

export interface VerdashIngestResult {
  status: "ingested" | "duplicate" | "ignored";
  conversationId?: string;
  messageId?: string;
  /** Por que foi ignorado — vai para o log, e é o que se lê quando "sumiu". */
  reason?: string;
}

/**
 * Identidade → `wa_identity`, o MESMO vocabulário dos outros canais
 * (`phone:+E164` | `lid:<digits>`).
 *
 * Reusar o prefixo é o que faz a pessoa ser o mesmo contato quando ela aparece
 * por mais de um canal. Um terceiro prefixo criaria dois contatos para uma
 * pessoa só.
 */
export function waIdentityFrom(msg: VerdashInboundMessage): string | null {
  if (msg.identity.phone) return `phone:${canonicalPhoneBR(msg.identity.phone)}`;
  if (msg.identity.lid) return `lid:${msg.identity.lid}`;
  return null;
}

export async function ingestVerdashInbound(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    channelSessionId: string;
    payload: unknown;
    requestId?: string;
  },
): Promise<VerdashIngestResult> {
  const msg = parseVerdashInbound(input.payload);
  if (!msg) return { status: "ignored", reason: "evento_sem_interesse" };

  // Grupo NÃO entra. Não é limitação técnica: é decisão de produto, e a mesma
  // que o resto do CRM já toma — o inbox é de ATENDIMENTO, uma conversa por
  // contato. Um número de clínica costuma estar em dezenas de grupos que não
  // têm nada a ver com paciente, e derramá-los no inbox faria o atendente
  // perder a conversa que importa no meio do ruído.
  if (msg.isGroup) return { status: "ignored", reason: "mensagem_de_grupo" };

  const identity = waIdentityFrom(msg);
  if (!identity) {
    // Sem âncora utilizável, criar contato anônimo faria a próxima mensagem da
    // MESMA pessoa virar um segundo contato.
    return { status: "ignored", reason: "sem_identidade_utilizavel" };
  }

  const contactId = await upsertContact(admin, input.organizationId, msg, identity);
  if (!contactId) return { status: "ignored", reason: "contato_nao_resolvido" };

  const { data: convData, error: convErr } = await admin.rpc("fn_upsert_wa_conversation", {
    p_org: input.organizationId,
    p_contact: contactId,
    p_session: input.channelSessionId,
  });
  if (convErr || !convData) return { status: "ignored", reason: "conversa_nao_resolvida" };
  const conversationId = convData as string;

  // O ENDEREÇO DE RESPOSTA, guardado como o servidor o entregou.
  //
  // Escrito SEMPRE, sem condição de "só se mudou": em SQL `NULL <> 'valor'` é
  // NULL, não TRUE, então um `neq` nunca alcançaria a conversa recém-criada —
  // que é justamente a que precisa do campo. O canal irmão perdeu tempo com
  // exatamente esse detalhe.
  await admin
    .from("conversations")
    .update({ provider_conversation_id: msg.chat })
    .eq("id", conversationId);

  const inserted = await insertMessage(admin, {
    organizationId: input.organizationId,
    conversationId,
    contactId,
    channelSessionId: input.channelSessionId,
    msg,
  });
  if (inserted === "duplicate") return { status: "duplicate", conversationId };

  await marcarConversa(admin, conversationId, msg);
  if (msg.attachments[0]?.url) {
    await pedirPersistenciaDaMidia(admin, input.organizationId, conversationId, inserted);
  }
  await efeitosDaEntrada(admin, input, msg, contactId, conversationId, inserted);

  // SAÍDA vinda do webhook = alguém respondeu o cliente POR FORA do CRM (do
  // celular, ou pela própria Verdash). A IA para nesta conversa: continuar
  // respondendo por cima de um humano que assumiu é a pior coisa que um agente
  // pode fazer. O eco do nosso PRÓPRIO envio já saiu como `"duplicate"` acima,
  // então não cai aqui.
  if (msg.direction === "outbound") {
    await pausarIaPorAtendimentoManual(admin, {
      organizationId: input.organizationId,
      conversationId,
      canal: "verdash",
    });
  }

  return { status: "ingested", conversationId, messageId: inserted };
}

/**
 * Os efeitos de negócio da mensagem que acabou de entrar.
 *
 * Delega no passo COMPARTILHADO (`lib/channels/pos-entrada.ts`) em vez de
 * reimplementar: opt-out, nascimento do lead e despacho do agente são regra do
 * produto, não característica deste transporte. Foi exatamente uma cópia
 * privada dentro de outro ingest que deixou um canal sem os três.
 *
 * Só para ENTRADA: o eco de um envio nosso (ou do celular do operador) não pede
 * para sair, não abre demanda e não acorda o agente.
 */
async function efeitosDaEntrada(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; requestId?: string },
  msg: VerdashInboundMessage,
  contactId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  if (msg.direction !== "inbound") return;

  await aplicarEfeitosPosEntrada(admin, {
    organizationId: input.organizationId,
    contactId,
    conversationId,
    messageId,
    channelSessionId: input.channelSessionId,
    texto: msg.text,
    nomeDoContato: msg.identity.displayName,
    requestId: input.requestId,
    origem: "verdash_webhook",
  });
}

/**
 * Carimba a conversa com o que acabou de chegar.
 *
 * Não é cosmético: `last_inbound_at` é a fonte da janela de 24h. Sem esta
 * chamada o selo diz "o cliente nunca escreveu" numa conversa em que ele acabou
 * de escrever, o guardrail do agente trata toda conversa como fechada, e o
 * contador de não lidas fica em zero com mensagem nova. Três sintomas sem
 * relação aparente, uma linha ausente — medido no canal irmão.
 *
 * Não carimba no `duplicate`: a reentrega é a MESMA mensagem, e somar de novo
 * inflaria o contador a cada reenvio.
 */
async function marcarConversa(
  admin: SupabaseClient,
  conversationId: string,
  msg: VerdashInboundMessage,
): Promise<void> {
  const { error } = await admin.rpc("fn_mark_conversation_message" as never, {
    p_conv: conversationId,
    p_direction: msg.direction,
    p_preview: (msg.text ?? rotuloDoAnexo(msg)).slice(0, 200),
    // A hora em que o cliente ESCREVEU, não a em que o webhook chegou: numa
    // reentrega atrasada as duas diferem por horas, e a ordem da lista e o
    // cálculo da janela dependem da primeira.
    p_at: msg.sentAt ?? new Date().toISOString(),
  } as never);
  if (error) {
    // Não derruba a ingestão: a mensagem já está gravada, e perder o carimbo é
    // ruim — mas MUITO melhor que devolver 500 e fazer o FZAP reenviar tudo.
    logger.warn("[verdash] carimbo da conversa falhou", {
      conversationId,
      detail: error.message,
    });
  }
}

/** "[Imagem]" e afins, para a prévia de mídia sem legenda não ficar vazia. */
function rotuloDoAnexo(msg: VerdashInboundMessage): string {
  switch (msg.attachments[0]?.type) {
    case "image":
      return "[Imagem]";
    case "video":
      return "[Vídeo]";
    case "audio":
      return "[Áudio]";
    case "sticker":
      return "[Figurinha]";
    case "document":
      return "[Documento]";
    default:
      return "";
  }
}

/**
 * Pede a persistência dos bytes do anexo.
 *
 * Mesmo evento e mesmo payload que os canais irmãos emitem — o consumidor é o
 * único (`workers/media-persist-worker.ts`), e um payload diferente por canal
 * faria o worker adivinhar de quem veio.
 *
 * Best-effort: a mensagem já está gravada e visível. Derrubar a ingestão aqui
 * devolveria 500 ao FZAP, que reenviaria tudo — trocaria uma mídia faltando por
 * uma tempestade de reentregas.
 */
async function pedirPersistenciaDaMidia(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const { error } = await admin.rpc("emit_event" as never, {
    p_event_type: "media.persist_requested",
    p_entity_kind: "message",
    p_entity_id: messageId,
    p_payload: { message_id: messageId, conversation_id: conversationId },
    p_metadata: { source: "verdash_webhook" },
    p_organization_id: organizationId,
  } as never);
  if (error) {
    logger.warn("[verdash] emit media.persist_requested falhou", {
      messageId,
      detail: error.message,
    });
  }
}

async function upsertContact(
  admin: SupabaseClient,
  organizationId: string,
  msg: VerdashInboundMessage,
  identity: string,
): Promise<string | null> {
  const kind = identity.startsWith("phone:") ? "phone" : "lid";
  const valor = identity.slice(identity.indexOf(":") + 1);
  const phone = msg.identity.phone ? canonicalPhoneBR(msg.identity.phone) : null;

  // Reusa a RPC dos canais irmãos: ela já resolve numa transação a corrida de
  // dois webhooks simultâneos, e escrever um segundo upsert seria criar um
  // segundo lugar onde a mesma corrida pode voltar.
  //
  // `p_phone` vai TAMBÉM quando a âncora é lid: sem isso, um contato que já
  // existia só com número vira um segundo cadastro quando o WhatsApp passa a
  // mandar o identificador opaco.
  const { data, error } = await admin.rpc("fn_upsert_wa_contact", {
    p_org: organizationId,
    p_kind: kind,
    p_phone: phone,
    p_lid: kind === "lid" ? valor : null,
    p_chat_id: msg.chat,
    p_notify: msg.identity.displayName,
  });
  if (error) return null;
  const contactId = (data as string) ?? null;
  if (!contactId) return null;

  // O telefone entra mesmo quando a âncora foi o id opaco — a RPC só grava
  // `phone_number` no kind phone, e descartá-lo deixa o contato sem número: o
  // envio para em `missing_phone_number` e a tela não tem o que mostrar ao
  // atendente que precisa saber com quem está falando.
  //
  // `is null` no filtro: só preenche o que está vazio. Sobrescrever apagaria
  // uma correção feita à mão na tela.
  if (phone) {
    await admin.from("contacts").update({ phone_number: phone }).eq("id", contactId).is("phone_number", null);
  }

  return contactId;
}

async function insertMessage(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: string;
    contactId: string;
    channelSessionId: string;
    msg: VerdashInboundMessage;
  },
): Promise<string | "duplicate"> {
  const { msg } = input;
  const anexo = msg.attachments[0];

  const { data, error } = await admin
    .from("messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      channel_session_id: input.channelSessionId,
      external_id: msg.externalId,
      // A SAÍDA também entra. Descartar o que é `fromMe` esconderia do
      // histórico toda mensagem mandada do celular do operador ou pela própria
      // Verdash — e o cliente veria metade da conversa. A duplicação que se
      // temeria já está resolvida pelo `unique (organization_id, external_id)`,
      // que devolve 23505 no eco do nosso próprio envio.
      direction: msg.direction,
      // Toda linha nascida do webhook veio de FORA do CRM. O default da coluna
      // é `'crm'` e ele mente aqui. Não é cosmético: as funções de fricção
      // contam SÓ `external_device` (sem isto o painel leria "zero atendimento
      // por fora" com o operador respondendo o dia inteiro pelo celular), e o
      // filtro de eco do próprio envio depende deste valor.
      sent_via: "external_device",
      status: msg.direction === "outbound" ? "sent" : "delivered",
      type: anexo?.type ?? "text",
      body: msg.text ?? anexo?.caption ?? null,
      // A URL é PONTEIRO, não conteúdo — e expira em ~30 min. Grava aqui para a
      // tela ter o que mostrar agora, e o worker baixa os bytes já.
      ...(anexo?.url ? { media_url: anexo.url, media_mime: anexo.mime } : {}),
      metadata: anexo ? { provider_attachments: msg.attachments } : {},
      ...(msg.sentAt ? { sent_at: msg.sentAt } : {}),
    })
    .select("id")
    .maybeSingle();

  // 23505 = unique violation em (organization_id, external_id). É o desfecho
  // ESPERADO de uma reentrega, não um erro: tratar como falha faria a rota
  // devolver 500 e o FZAP reenviar de novo, para sempre.
  if (error?.code === "23505") return "duplicate";
  if (error || !data) throw new Error(`verdash_ingest_insert_failed: ${error?.message ?? "sem id"}`);

  return (data as { id: string }).id;
}
