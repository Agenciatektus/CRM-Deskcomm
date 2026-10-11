/**
 * O protobuf do WhatsApp, como o FZAP o entrega: desembrulhar os invólucros e
 * achar o anexo. Módulo PURO, separado de `./webhook.ts` só por tamanho.
 */

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

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

/** Os wrappers que embrulham a mensagem de verdade no protobuf do WhatsApp. */
const INVOLUCROS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "documentWithCaptionMessage",
  "editedMessage",
  "deviceSentMessage",
  "viewOnceMessageV2Extension",
  // A foto de um álbum chega embrulhada aqui; o álbum em si só anuncia.
  "associatedChildMessage",
  "lottieStickerMessage",
];

/** `imageMessage` → `image`. A ordem importa: o primeiro que casar vence. */
const CAMPOS_DE_MIDIA: Array<[string, VerdashAttachment["type"]]> = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  // Vídeo "bolinha" (recado em vídeo): é vídeo, só muda o formato na tela.
  ["ptvMessage", "video"],
  ["audioMessage", "audio"],
  ["stickerMessage", "sticker"],
  ["documentMessage", "document"],
];

/** Desembrulha os invólucros até chegar na mensagem de verdade. */
export function desembrulhar(message: Record<string, unknown>): Record<string, unknown> {
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

/**
 * O anexo, quando houver.
 *
 * A `downloadURL` mora no TOPO do payload (é metadado que o FZAP acrescenta),
 * não dentro do protobuf — por isso esta função recebe os dois.
 */
export function anexoDe(
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
