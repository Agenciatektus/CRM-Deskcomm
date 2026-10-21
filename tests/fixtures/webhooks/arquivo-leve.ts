/**
 * Corpos e cabeçalhos no FORMATO de produção, anonimizados, para medir o peso
 * de uma linha de `webhook_events_log` antes/depois do PR "um corpo só".
 *
 * Reconstruídos a partir do que os leitores de cada canal leem
 * (`lib/channels/verdash/protobuf.ts`/`conteudo.ts`, o envelope do Instagram
 * que o Verdash repassa, o evento `message` do WAHA). Números, nomes, ids e
 * tokens são fictícios.
 */

/** Evento de mensagem do FZAP (canal Verdash), v1.27, com atribuição de anúncio. */
const mensagemFzap = {
  extendedTextMessage: {
    text: "Olá! Vi o anúncio de vocês no Instagram e queria saber o valor do planejado para cozinha.",
    contextInfo: {
      externalAdReply: {
        title: "Planejados sob medida em 30 dias",
        body: "Fale com um consultor agora",
        mediaType: 1,
        thumbnailURL: "https://scontent.exemplo/v/t45.1600-4/000000000_000000000000_n.jpg?stp=dst-jpg&_nc_cat=1",
        sourceType: "ad",
        sourceID: "120200000000000001",
        sourceURL: "https://fb.me/0000000000",
        containsAutoReply: false,
        renderLargerThumbnail: true,
        showAdAttribution: true,
        ctwaClid: "AffqZb0000000000000000000000000000000000000000000000000000000000000000000000",
        ref: "",
      },
      conversionSource: "FB_Ads",
      conversionDelaySeconds: 3,
      entryPointConversionSource: "ctwa_ad",
      entryPointConversionApp: "instagram",
      entryPointConversionDelaySeconds: 3,
    },
  },
  messageContextInfo: {
    deviceListMetadata: {
      senderKeyHash: "q1w2e3r4t5y6u7i8o9p0==",
      senderTimestamp: "1761051000",
      recipientKeyHash: "a1s2d3f4g5h6j7k8l9z0==",
      recipientTimestamp: "1761040000",
    },
    deviceListMetadataVersion: 2,
    messageSecret: "Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmE=",
  },
};

export const CORPO_VERDASH = JSON.stringify({
  type: "Message",
  token: "TOK-INSTANCIA-ficticio-0000",
  instanceName: "cliente-exemplo-01",
  userID: "5566999990000:12@s.whatsapp.net",
  event: {
    Info: {
      Chat: "5566988887777@s.whatsapp.net",
      Sender: "5566988887777@s.whatsapp.net",
      IsFromMe: false,
      IsGroup: false,
      AddressingMode: "pn",
      SenderAlt: "123456789012345@lid",
      RecipientAlt: "",
      BroadcastListOwner: "",
      BroadcastRecipients: null,
      ID: "3EB0A1B2C3D4E5F6A7B8C9",
      ServerID: 0,
      Type: "text",
      PushName: "Cliente Exemplo",
      Timestamp: "2026-10-21T10:00:00-03:00",
      Category: "",
      Multicast: false,
      MediaType: "",
      Edit: "",
      MsgBotInfo: { EditType: "", EditTargetID: "", EditSenderTimestampMS: "0001-01-01T00:00:00Z" },
      MsgMetaInfo: { TargetID: "", TargetSender: "", TargetChat: "", ThreadMessageID: "", ThreadMessageSenderJID: "" },
      VerifiedName: null,
      DeviceSentMeta: null,
    },
    Message: mensagemFzap,
    IsEphemeral: false,
    IsViewOnce: false,
    IsViewOnceV2: false,
    IsViewOnceV2Extension: false,
    IsDocumentWithCaption: false,
    IsLottieSticker: false,
    IsBotInvoke: false,
    IsEdit: false,
    SourceWebMsg: null,
    UnavailableRequestID: "",
    RetryCount: 0,
    NewsletterMeta: null,
    RawMessage: mensagemFzap,
  },
});

/** Direct do Instagram, no envelope que o Verdash repassa (com o perfil anexado). */
export const CORPO_INSTAGRAM = JSON.stringify({
  tipo: "direct",
  provider_message_id: "aWdfZAG1faWQ6MTc4NDE0MDAwMDAwMDAwMDA6MzQwMjgyMzY2ODQxNzEwMzAw",
  ad_id: null,
  conta: { id: "17841400000000000", username: "loja_exemplo" },
  perfil: {
    name: "Cliente Exemplo",
    username: "cliente.exemplo",
    profile_pic: "https://scontent.exemplo/v/t51.2885-19/000000000_000000000000_n.jpg?stp=dst-jpg_s206x206&_nc_ht=x&oh=00_AYA&oe=67000000",
    follower_count: 312,
    is_user_follow_business: true,
    is_business_follow_user: false,
  },
  evento: {
    sender: { id: "1234567890123456" },
    recipient: { id: "17841400000000000" },
    timestamp: 1_761_051_000_000,
    message: {
      mid: "aWdfZAG1faWQ6MTc4NDE0MDAwMDAwMDAwMDA6MzQwMjgyMzY2ODQxNzEwMzAw",
      text: "Oi! Ainda tem esse modelo no tamanho M?",
      attachments: [
        {
          type: "image",
          payload: {
            url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1234567890123456&signature=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
          },
        },
      ],
    },
  },
});

/** Evento `message` do WAHA (engine NOWEB), como chega na rota por token. */
export const CORPO_WAHA = JSON.stringify({
  id: "evt_01JAAAAAAAAAAAAAAAAAAAAAAA",
  timestamp: 1761051000123,
  event: "message",
  session: "default",
  metadata: {},
  me: { id: "5566999990000@c.us", pushName: "Loja Exemplo" },
  payload: {
    id: "false_5566988887777@c.us_3EB0A1B2C3D4E5F6A7B8C9",
    timestamp: 1761051000,
    from: "5566988887777@c.us",
    fromMe: false,
    source: "app",
    to: "5566999990000@c.us",
    participant: null,
    body: "Bom dia, vocês abrem no sábado?",
    hasMedia: false,
    media: null,
    ack: 1,
    ackName: "SERVER",
    author: null,
    location: null,
    vCards: [],
    replyTo: null,
    _data: {
      key: { remoteJid: "5566988887777@s.whatsapp.net", fromMe: false, id: "3EB0A1B2C3D4E5F6A7B8C9" },
      messageTimestamp: 1761051000,
      pushName: "Cliente Exemplo",
      broadcast: false,
      message: {
        conversation: "Bom dia, vocês abrem no sábado?",
        messageContextInfo: {
          deviceListMetadata: { senderKeyHash: "q1w2e3r4t5y6u7i8o9p0==", senderTimestamp: "1761051000" },
          deviceListMetadataVersion: 2,
        },
      },
    },
  },
  engine: "NOWEB",
  environment: { version: "2025.9.1", engine: "NOWEB", tier: "CORE", browser: null },
});

/**
 * Cabeçalhos como chegam no app: os do provedor mais os que o Cloudflare e o
 * proxy (Caddy/Traefik) acrescentam.
 */
export function cabecalhosDeProducao(doProvedor: Record<string, string>): Headers {
  return new Headers({
    host: "crm.exemplo.com.br",
    "user-agent": "Go-http-client/2.0",
    "content-length": "2900",
    "content-type": "application/json",
    accept: "*/*",
    "accept-encoding": "gzip, br",
    "cdn-loop": "cloudflare; loops=1",
    "cf-connecting-ip": "203.0.113.10",
    "cf-ipcountry": "BR",
    "cf-ray": "8d1234567890abcd-GRU",
    "cf-visitor": '{"scheme":"https"}',
    "cf-warp-tag-id": "00000000-0000-0000-0000-000000000000",
    "x-forwarded-for": "203.0.113.10, 172.70.0.1",
    "x-forwarded-host": "crm.exemplo.com.br",
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https",
    "x-forwarded-server": "traefik-7f9c",
    "x-real-ip": "172.70.0.1",
    via: "1.1 Caddy",
    traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    ...doProvedor,
  });
}
