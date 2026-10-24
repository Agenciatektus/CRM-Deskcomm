/**
 * O anúncio de onde veio a conversa, lido do payload do canal Verdash.
 *
 * O FZAP entrega o protobuf do WhatsApp, e o bloco de anúncio (clique para o
 * WhatsApp) vem em `contextInfo.externalAdReply`. Até aqui este canal o
 * descartava: os irmãos (QR, API oficial) estampavam a atribuição no contato e
 * este não, então todo contato que chegou por anúncio entrava sem campanha.
 *
 * ─── Por que a busca é por NOME, e não por caminho ──────────────────────────
 *
 * O formato do FZAP já mudou três vezes (v1.19 → v1.22 → v1.27), e a última
 * mudança mandou o bloco para dentro do tipo da mensagem
 * (`extendedTextMessage.contextInfo`). Um caminho fixo quebra na próxima; a
 * busca pelo nome do bloco, com profundidade limitada, não.
 *
 * ─── O que conta como "veio de anúncio" ─────────────────────────────────────
 *
 * `externalAdReply` também aparece em prévia de link comum. O carimbo do próprio
 * WhatsApp é `sourceType: "ad"`, e o `ctwaClid` identifica o clique. Sem um dos
 * dois o bloco é prévia de link, e estampá-lo contaria conversa orgânica como
 * tráfego pago.
 */
import {
  obj,
  str,
  type AtribuicaoDeAnuncio,
  type Bruto,
} from "@/lib/leads/atribuicao-de-anuncio";

const PROFUNDIDADE_MAXIMA = 6;
/** Chaves que carregam bytes (miniatura em base64) e nunca um bloco de anúncio. */
const CHAVES_DE_BYTES = new Set(["JPEGThumbnail", "thumbnail", "RawMessage"]);
/** Teto por texto: validação de tamanho no limite, para o jsonb não crescer. */
const TETO_DO_TEXTO = 500;
/** Teto de chaves guardadas como prova: o bloco real tem ~26. */
const TETO_DE_CHAVES = 40;
/**
 * Não se desce na mensagem CITADA: o anúncio dela não é o de onde esta pessoa
 * veio. Quem chegou de forma orgânica e respondeu citando uma prévia de anúncio
 * ganharia a atribuição, e o primeiro toque a tornaria irreversível.
 */
const CHAVES_NAO_PERCORRIDAS = new Set([...CHAVES_DE_BYTES, "quotedMessage", "quoted_message"]);

const NOMES_DO_BLOCO = [
  "externalAdReply",
  "ExternalAdReply",
  "AdReplyInfo",
  "adReplyInfo",
  "ad_reply_info",
  "referral",
] as const;

function acharBloco(no: unknown, profundidade = 0): Bruto | null {
  const o = obj(no);
  if (!o || profundidade > PROFUNDIDADE_MAXIMA) return null;

  for (const nome of NOMES_DO_BLOCO) {
    const achado = obj(o[nome]);
    if (achado) return achado;
  }
  for (const [chave, filho] of Object.entries(o)) {
    if (CHAVES_NAO_PERCORRIDAS.has(chave)) continue;
    const achado = acharBloco(filho, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

function ler(bloco: Bruto, ...chaves: string[]): string | null {
  for (const chave of chaves) {
    const v = str(bloco[chave]);
    if (v) return v.trim().slice(0, TETO_DO_TEXTO);
  }
  return null;
}

/** O bloco sem bytes e com texto aparado: é a prova guardada, não a miniatura. */
function enxugar(bloco: Bruto): Bruto {
  const saida: Bruto = {};
  for (const [chave, valor] of Object.entries(bloco)) {
    if (Object.keys(saida).length >= TETO_DE_CHAVES) break;
    if (CHAVES_DE_BYTES.has(chave)) continue;
    if (typeof valor === "string") saida[chave] = valor.slice(0, TETO_DO_TEXTO);
    else if (typeof valor === "number" || typeof valor === "boolean") saida[chave] = valor;
  }
  return saida;
}

export function extrairAtribuicaoVerdash(payload: unknown): AtribuicaoDeAnuncio | null {
  const evento = obj(obj(payload)?.event);
  const bloco = acharBloco(evento) ?? acharBloco(payload);
  if (!bloco) return null;

  const cliqueId = ler(bloco, "ctwaClid", "CtwaClid", "ctwa_clid");
  const tipo = ler(bloco, "sourceType", "SourceType", "source_type");
  // `sourceType` diferente de "ad" (post, prévia de link) com clique ao lado não
  // é anúncio: o primeiro toque não se desfaz, então na dúvida não se estampa.
  // Mesma regra do irmão por QR (`lib/waha/atribuicao-de-anuncio.ts`).
  if (tipo && tipo.toLowerCase() !== "ad") return null;
  const deAnuncio = tipo?.toLowerCase() === "ad";
  if (!cliqueId && !deAnuncio) return null;

  return {
    plataforma: "meta_ads",
    sourceId: cliqueId,
    // `sourceID` é o id do ANÚNCIO (o clique é o `ctwaClid`): são perguntas
    // diferentes, ver `AtribuicaoDeAnuncio.adId`.
    adId: ler(bloco, "sourceID", "sourceId", "SourceID", "source_id"),
    titulo: ler(bloco, "title", "Title"),
    corpo: ler(bloco, "body", "Body"),
    sourceUrl: ler(bloco, "sourceURL", "sourceUrl", "SourceURL", "source_url"),
    bruto: enxugar(bloco),
  };
}
