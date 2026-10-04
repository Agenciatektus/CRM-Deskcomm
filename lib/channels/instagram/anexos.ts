/**
 * Os ANEXOS do Direct do Instagram — lidos do payload, sem banco e sem rede.
 *
 * O evento que a Verdash encaminha é o objeto `messaging` cru da Meta, e o
 * anexo vem em `message.attachments`:
 *
 *   [{ type: "image" | "video" | "audio" | "file" | "share" | "story_mention"
 *            | "ig_reel" | "reel" | "ig_post" | "animated_image" | …,
 *      payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=…&signature=…" } }]
 *
 * A `url` é um ponteiro ASSINADO da Meta, com validade curta: ou o CRM baixa os
 * bytes enquanto ela vale (o worker de mídia, pelo mesmo caminho do WhatsApp),
 * ou a mídia se perde. Até a #13 da auditoria, este canal descartava o anexo e
 * gravava só "tem anexo" — 77 mensagens sem nada para mostrar.
 *
 * Aqui só se LÊ e se VALIDA a forma. O host é conferido de novo no download
 * (`baixarMidiaDaMeta`), que é onde a URL vira requisição.
 */

/** O tipo da linha em `messages.type` — o vocabulário do CHECK da tabela. */
export type TipoDaMensagem = "image" | "video" | "audio" | "document";

export interface AnexoDoInstagram {
  /** O `type` da Meta, cru e truncado: vai para o metadata, para investigar. */
  tipoNaMeta: string;
  url: string;
  /** O tipo da linha. `null` = só o mime do download decide (story, post, reel). */
  tipoDaMensagem: TipoDaMensagem | null;
}

/** Teto de anexos por mensagem: a Meta manda até 10 imagens num Direct. */
export const TETO_DE_ANEXOS = 10;
const TETO_DA_URL = 4096;

const TIPO_DIRETO: Record<string, TipoDaMensagem> = {
  image: "image",
  animated_image: "image",
  video: "video",
  audio: "audio",
  file: "document",
};

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Só `https:` com host — o resto (allowlist, redirect, IP) é do download. */
function urlUtil(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > TETO_DA_URL) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname ? u.toString() : null;
  } catch {
    return null;
  }
}

export function lerAnexos(attachments: unknown): AnexoDoInstagram[] {
  if (!Array.isArray(attachments)) return [];
  const lidos: AnexoDoInstagram[] = [];
  for (const bruto of attachments.slice(0, TETO_DE_ANEXOS)) {
    const a = objeto(bruto);
    const tipo = typeof a?.type === "string" ? a.type.replace(/[^a-z_]/gi, "").slice(0, 32).toLowerCase() : "";
    const url = urlUtil(objeto(a?.payload)?.url);
    if (!tipo || !url) continue;
    lidos.push({ tipoNaMeta: tipo, url, tipoDaMensagem: TIPO_DIRETO[tipo] ?? null });
  }
  return lidos;
}
