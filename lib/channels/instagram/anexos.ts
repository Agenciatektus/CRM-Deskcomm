/**
 * Os ANEXOS do Direct do Instagram — lidos do payload, sem banco e sem rede.
 *
 * O evento que a Verdash encaminha é o objeto `messaging` cru da Meta, e o
 * anexo vem em `message.attachments: [{ type, payload }]`. Os tipos e as
 * CHAVES abaixo foram conferidos em payloads de produção (50, só leitura,
 * `webhook_events_log`, 04/10/2026):
 *
 *   image, audio, story_mention  → payload { url }
 *   ig_post                      → payload { ig_post_media_id, title, url }
 *   ig_reel                      → payload { reel_video_id, title, url }
 *   ig_story                     → payload { story_media_id, story_media_url }   ← NÃO é `url`
 *   template                     → payload genérico (cartão/botões): não é mídia
 *   ephemeral                    → mídia temporária ("ver uma vez")
 *
 * Hosts vistos: `lookaside.fbsbx.com` (o ARQUIVO, ponteiro assinado que vence)
 * e `www.instagram.com` (o PERMALINK do post/reel — uma página HTML, não um
 * arquivo). Baixar a página como mídia gravaria HTML como "imagem"; o permalink
 * vira LINK ("Ver no Instagram"), e não é tratado como falha de download.
 *
 * DECISÃO sobre `ephemeral`: NÃO é guardada. Quem manda mídia temporária
 * escolheu que ela suma; guardar para sempre no bucket contraria a escolha da
 * pessoa e a minimização da LGPD. A tela diz "Mídia temporária".
 *
 * Aqui só se LÊ e se VALIDA a forma. O host do arquivo é conferido de novo no
 * download (`baixarMidiaDaMeta`), que é onde a URL vira requisição.
 */

/** O tipo da linha em `messages.type` — o vocabulário do CHECK da tabela. */
export type TipoDaMensagem = "image" | "video" | "audio" | "document";

export interface AnexoDoInstagram {
  /** O `type` da Meta, saneado: vai para o metadata, para investigar. */
  tipoNaMeta: string;
  url: string;
  /** O tipo da linha. `null` = só o mime do download decide (story, post, reel). */
  tipoDaMensagem: TipoDaMensagem | null;
}

export interface LinkDoInstagram {
  tipoNaMeta: string;
  /** Permalink em `instagram.com` — abre no Instagram, não é baixado. */
  url: string;
  titulo: string | null;
}

export interface AnexosLidos {
  /** Arquivos a baixar, na ordem da Meta. */
  midias: AnexoDoInstagram[];
  /** Permalinks de post/reel: viram "Ver no Instagram". */
  links: LinkDoInstagram[];
  /** Veio mídia temporária (`ephemeral`): não é guardada, de propósito. */
  temporaria: boolean;
}

/** Teto de anexos lidos por mensagem: a Meta manda até 10 imagens num Direct. */
export const TETO_DE_ANEXOS = 10;
const TETO_DA_URL = 4096;
const TETO_DO_TITULO = 300;

const TIPO_DIRETO: Record<string, TipoDaMensagem> = {
  image: "image",
  animated_image: "image",
  video: "video",
  audio: "audio",
  file: "document",
};

/** Tipos que nunca são arquivo: cartão/botões da Meta. */
const NAO_E_MIDIA = new Set(["template", "fallback", "generic"]);

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Só `https:` com host — o resto (allowlist, redirect, IP) é do download. */
function urlHttps(v: unknown): URL | null {
  if (typeof v !== "string" || v.length === 0 || v.length > TETO_DA_URL) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname ? u : null;
  } catch {
    return null;
  }
}

/** Página do Instagram (permalink), e não arquivo do CDN. */
export function ehPermalinkDoInstagram(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  return host === "instagram.com" || host === "www.instagram.com";
}

function titulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, TETO_DO_TITULO) : null;
}

export function lerAnexos(attachments: unknown): AnexosLidos {
  const lidos: AnexosLidos = { midias: [], links: [], temporaria: false };
  if (!Array.isArray(attachments)) return lidos;
  for (const bruto of attachments.slice(0, TETO_DE_ANEXOS)) {
    const a = objeto(bruto);
    const tipo = typeof a?.type === "string" ? a.type.replace(/[^a-z_]/gi, "").slice(0, 32).toLowerCase() : "";
    if (!tipo || NAO_E_MIDIA.has(tipo)) continue;
    if (tipo === "ephemeral") {
      lidos.temporaria = true;
      continue;
    }
    const payload = objeto(a?.payload);
    // `ig_story` traz o arquivo em `story_media_url`; os demais, em `url`.
    const u = urlHttps(tipo === "ig_story" ? (payload?.story_media_url ?? payload?.url) : payload?.url);
    if (!u) continue;
    if (ehPermalinkDoInstagram(u)) {
      lidos.links.push({ tipoNaMeta: tipo, url: u.toString(), titulo: titulo(payload?.title) });
      continue;
    }
    lidos.midias.push({ tipoNaMeta: tipo, url: u.toString(), tipoDaMensagem: TIPO_DIRETO[tipo] ?? null });
  }
  return lidos;
}
