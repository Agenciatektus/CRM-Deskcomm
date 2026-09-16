/**
 * Leitura do webhook do canal Verdash — módulo PURO, sem banco e sem rede.
 *
 * A separação entre o que decide (isto é mensagem? de quem? com que anexo?) e o
 * que escreve não é estética: o que decide dá para provar sem subir Postgres, e
 * o que escreve fica pequeno o bastante para caber na cabeça.
 *
 * ─── Como este canal se autentica, e por que não há HMAC ───────────────────
 *
 * O FZAP não assina o corpo — não há assinatura a conferir. O que ele tem, e os
 * outros canais não, é a possibilidade de carregar HEADERS ESCOLHIDOS POR NÓS
 * em cada entrega: ao registrar o webhook, o CRM manda junto um segredo próprio
 * (o mesmo `webhook_secret` que os demais canais já usam, gerado na conexão e
 * guardado cifrado), e a verificação é compará-lo.
 *
 * Isso é melhor que a alternativa óbvia. O FZAP também manda o header `token`
 * com o token da instância — é assim que o receptor da Verdash autentica esses
 * mesmos webhooks hoje, em produção — e daria para conferir contra ele. Mas o
 * token da instância é a credencial de ENVIO: usá-la também como segredo de
 * entrada faria um único vazamento custar as duas pontas, e impediria trocar
 * uma sem derrubar a outra. Um segredo por finalidade custa uma linha a mais no
 * cadastro do webhook.
 *
 * A comparação é em tempo constante. Comparar segredo com `===` vaza o tamanho
 * do prefixo correto pelo tempo de resposta, e é barato não fazer isso.
 *
 * ─── Por que a leitura do payload é defensiva ao ponto de parecer exagero ───
 *
 * Porque o formato do FZAP já mudou três vezes (v1.19 → v1.22 → v1.27), e a
 * última mudança — o protobuf cru do WhatsApp — matou a atribuição de anúncio
 * em TODOS os clientes da Verdash por ~4 dias, sem erro e sem log. Um caminho
 * fixo quebra na próxima mudança; procurar o bloco pelo NOME, não.
 */
import { timingSafeEqual } from "node:crypto";

/** Um anexo, já reduzido ao que o CRM precisa saber. */
export interface VerdashAttachment {
  /** Vocabulário de `messages.type`. */
  type: "image" | "video" | "audio" | "sticker" | "document";
  /**
   * A URL que o FZAP já resolveu para este arquivo.
   *
   * ⚠️ EFÊMERA: o FZAP costuma dar ~30 minutos (`expiresIn` diz quanto). Ela é
   * PONTEIRO para os bytes, nunca o lugar onde eles moram — quem recebe precisa
   * baixar agora. Guardar esta URL e exibi-la depois mostra imagem quebrada.
   *
   * A `url` que vem DENTRO do protobuf do WhatsApp fica deliberadamente de
   * fora: aquela aponta para o arquivo CRIPTOGRAFADO (`.enc`), que não abre em
   * lugar nenhum sem a `mediaKey`.
   */
  url: string | null;
  mime: string | null;
  fileName: string | null;
  caption: string | null;
}

export interface VerdashInboundMessage {
  kind: "message";
  externalId: string;
  direction: "inbound" | "outbound";
  /** JID do chat: `5566…@s.whatsapp.net` ou `1203…@g.us`. */
  chat: string;
  /** O que o CRM usa como âncora de identidade. */
  identity: {
    phone: string | null;
    lid: string | null;
    displayName: string | null;
  };
  isGroup: boolean;
  text: string | null;
  attachments: VerdashAttachment[];
  sentAt: string | null;
}

/** Os wrappers que embrulham a mensagem de verdade no protobuf do WhatsApp. */
const INVOLUCROS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "documentWithCaptionMessage",
  "editedMessage",
  "deviceSentMessage",
];

/** `imageMessage` → `image`. A ordem importa: o primeiro que casar vence. */
const CAMPOS_DE_MIDIA: Array<[string, VerdashAttachment["type"]]> = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["audioMessage", "audio"],
  ["stickerMessage", "sticker"],
  ["documentMessage", "document"],
];

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * O segredo apresentado no header confere com o desta sessão?
 *
 * Tempo constante, e `false` para qualquer ausência: sem header, sem segredo
 * gravado, ou tamanhos diferentes. `timingSafeEqual` LANÇA quando os buffers
 * têm tamanhos diferentes, então o teste de tamanho vem antes — e ele não vaza
 * nada que o atacante já não saiba ao contar os próprios bytes.
 */
export function verifyVerdashToken(
  headerToken: string | null,
  instanceToken: string | null,
): boolean {
  if (!headerToken || !instanceToken) return false;
  const a = Buffer.from(headerToken);
  const b = Buffer.from(instanceToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * O tipo do evento, como o FZAP o nomeia (`Message`, `ReadReceipt`, `Connected`…).
 *
 * `payload.type` é o campo canônico. `payload.event` vira o OBJETO do evento a
 * partir da v1.22 — mas nas versões antigas ele era a string do tipo, e uma
 * instalação com FZAP velho ainda manda assim. Ler os dois custa uma linha.
 */
export function tipoDoEvento(payload: unknown): string | null {
  const p = obj(payload);
  return str(p.type) ?? str(p.event);
}

/** Desembrulha os invólucros até chegar na mensagem de verdade. */
function desembrulhar(message: Record<string, unknown>): Record<string, unknown> {
  let atual = message;
  // Teto de 5: invólucro aninhado é real (`ephemeral` dentro de `viewOnce`),
  // mas um payload que se embrulha infinitamente é hostil, não legítimo.
  for (let i = 0; i < 5; i += 1) {
    const wrapper = INVOLUCROS.find((c) => c in atual);
    if (!wrapper) break;
    const dentro = obj(atual[wrapper]);
    const proximo = obj(dentro.message ?? dentro);
    if (Object.keys(proximo).length === 0) break;
    atual = proximo;
  }
  return atual;
}

/** O texto da mensagem, onde quer que ele esteja. */
function textoDe(message: Record<string, unknown>): string | null {
  return (
    str(message.conversation) ??
    str(obj(message.extendedTextMessage).text) ??
    str(message.text) ??
    null
  );
}

/**
 * O anexo, quando houver.
 *
 * A `downloadURL` mora no TOPO do payload (é metadado que o FZAP acrescenta),
 * não dentro do protobuf — por isso esta função recebe os dois.
 */
function anexoDe(
  message: Record<string, unknown>,
  topo: Record<string, unknown>,
): VerdashAttachment | null {
  for (const [campo, tipo] of CAMPOS_DE_MIDIA) {
    // A PRESENÇA do campo é o que diz o tipo, não o quanto ele traz dentro.
    // Testar `Object.keys(...).length` classificaria como "sem anexo" um
    // `videoMessage` magro — e o atendente veria bolha vazia no lugar do vídeo
    // que o cliente mandou.
    if (!(campo in message)) continue;
    const no = obj(message[campo]);
    return {
      type: tipo,
      url: str(topo.downloadURL),
      mime: str(no.mimetype),
      fileName: str(no.fileName) ?? str(no.title) ?? str(topo.downloadFileName),
      caption: str(no.caption),
    };
  }
  return null;
}

/** `5566812769 20@s.whatsapp.net` → `+556681276920`; `@lid` devolve `null`. */
function telefoneDoJid(jid: string | null): string | null {
  if (!jid || jid.includes("@lid")) return null;
  const digitos = (jid.split("@")[0] ?? "").split(":")[0]?.replace(/\D/g, "") ?? "";
  return digitos.length >= 8 ? `+${digitos}` : null;
}

function lidDoJid(jid: string | null): string | null {
  if (!jid || !jid.includes("@lid")) return null;
  const parte = jid.split("@")[0] ?? "";
  return parte.length > 0 ? parte : null;
}

/**
 * Lê um evento de mensagem. `null` para tudo que não for mensagem — recibo,
 * presença, evento de conexão — e isso NÃO é falha: é a maioria do tráfego.
 */
export function parseVerdashInbound(payload: unknown): VerdashInboundMessage | null {
  const p = obj(payload);
  const tipo = tipoDoEvento(p);
  // `AutomationMessage` é mensagem de verdade — o FZAP a usa para o que saiu
  // por automação dele. Deixá-la de fora esconderia do histórico justamente o
  // que o cliente recebeu sem ninguém digitar.
  if (tipo !== "Message" && tipo !== "AutomationMessage") return null;

  const evt = obj(p.event);
  const info = obj(evt.Info);
  const externalId = str(info.ID);
  if (!externalId) return null;

  const chat = str(info.Chat) ?? str(info.Sender) ?? "";
  if (!chat) return null;

  const isGroup = chat.includes("@g.us") || Boolean(info.IsGroup);
  const fromMe = Boolean(info.IsFromMe);

  // Em grupo quem fala é o `Sender`; em conversa de um para um o `Chat` já é a
  // pessoa. `SenderAlt`/`RecipientAlt` são o par que o FZAP acrescentou para o
  // modo LID: quando o `Sender` vem como `@lid`, é ali que o telefone aparece.
  const autorJid = isGroup ? (str(info.Sender) ?? chat) : chat;
  const alt = fromMe ? str(info.RecipientAlt) : str(info.SenderAlt);

  const message = desembrulhar(obj(evt.Message));
  const anexo = anexoDe(message, p);

  const carimbo = str(info.Timestamp);
  const sentAt = carimbo
    ? carimbo
    : typeof info.Timestamp === "number"
      ? new Date(info.Timestamp * 1000).toISOString()
      : null;

  return {
    kind: "message",
    externalId,
    direction: fromMe ? "outbound" : "inbound",
    chat,
    identity: {
      phone: telefoneDoJid(autorJid) ?? telefoneDoJid(alt),
      lid: lidDoJid(autorJid) ?? lidDoJid(alt),
      displayName: str(info.PushName),
    },
    isGroup,
    text: textoDe(message),
    attachments: anexo ? [anexo] : [],
    sentAt,
  };
}

/**
 * O contrato mínimo do fio, verificado ANTES de qualquer leitura.
 *
 * Existe pelo mesmo motivo do canal intermediado: sem isto, um campo que muda
 * de tipo faz o parser devolver `null`, a rota responder 200 `evento_sem_
 * interesse` — exatamente como responde a um evento que de fato não interessa —
 * e a mensagem do cliente sumir com carimbo de normalidade.
 *
 * A recusa nomeia os CAMPOS e nunca os valores (dado de cliente).
 */
export type LeituraVerdash =
  | { ok: true; envelope: Record<string, unknown> }
  | { ok: false; motivo: "json_invalido"; campos: string[] }
  | { ok: false; motivo: "contrato"; campos: string[] };

export function lerEnvelopeVerdash(rawBody: string): LeituraVerdash {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, motivo: "json_invalido", campos: [] };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, motivo: "contrato", campos: ["raiz"] };
  }

  const p = parsed as Record<string, unknown>;
  const faltando: string[] = [];
  // `type` é o único campo que TODO evento do FZAP carrega. Um payload sem ele
  // não é um evento que não interessa: é outro sistema falando nesta URL.
  if (tipoDoEvento(p) === null) faltando.push("type");

  return faltando.length > 0
    ? { ok: false, motivo: "contrato", campos: faltando }
    : { ok: true, envelope: p };
}
