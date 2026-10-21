/**
 * Por qual canal se pede a foto de um contato, e com qual endereço.
 *
 * Mora em lib/channels/ porque nomeia provider: o cron de fotos só pergunta
 * "quais canais servem para este contato?" e "qual endereço mando?", sem saber
 * qual canal é (doutrina `restricao-de-canal`).
 */
import {
  baixarMidiaDaMeta,
  type OpcoesDoDownload,
} from "@/lib/messaging/media/baixar-midia-da-meta";

import { PROVIDERS_DE_MENSAGEM } from "./capabilities";
import type { ChannelProvider } from "./types";
import { fzapPublicBaseUrl } from "./verdash/credentials";

/**
 * Canais que conseguem achar este contato. O IGSID só vale no Instagram, e o
 * WhatsApp só serve a quem tem identidade de WhatsApp: pedir a foto de um
 * contato só de Instagram a uma sessão de WhatsApp (ou o contrário) é chamada
 * gasta que volta "sem foto".
 */
export function providersDaFoto(contato: {
  wa_identity?: string | null;
  instagram_igsid?: string | null;
}): ChannelProvider[] {
  return PROVIDERS_DE_MENSAGEM.filter((p) =>
    p === "instagram" ? !!contato.instagram_igsid : !!contato.wa_identity,
  );
}

/** O endereço que o canal espera: IGSID no Instagram, chatId no WhatsApp. */
export function destinatarioDaFoto(
  provider: ChannelProvider,
  contato: { instagram_igsid?: string | null },
  chatIdWhatsapp: string | null,
): string | null {
  return provider === "instagram" ? (contato.instagram_igsid ?? null) : chatIdWhatsapp;
}

/**
 * De onde uma foto de perfil pode vir. A ÚNICA lista: quem baixa a foto confere
 * aqui, e nada fora dela é buscado (o cron baixa de dentro da rede do servidor).
 *
 * - `.whatsapp.net`: CDN das fotos do WhatsApp (`pps.whatsapp.net`), o que o
 *   WAHA devolve e o que o FZAP repassa.
 * - `.fbcdn.net` / `.cdninstagram.com`: CDN da Meta, onde mora a foto que o
 *   perfil do Instagram devolve.
 * - o host PÚBLICO do FZAP (`fzapPublicBaseUrl()`, `FZAP_PUBLIC_BASE_URL`), de
 *   onde sai o `publicDownloadUrl` — no modo direto e no pareado, que a Verdash
 *   pede ao mesmo host (`FZAP_PUBLIC_BASE_URL` em `crm-foto-perfil`). NUNCA o
 *   `verdashBaseUrl()`: em produção ele é a rede interna (`http://10.0.1.1:8081`).
 */
export const SUFIXOS_DE_HOST_DA_FOTO = [
  ".whatsapp.net",
  ".fbcdn.net",
  ".cdninstagram.com",
] as const;

function hostDoFzapPublico(): string | null {
  try {
    const url = new URL(fzapPublicBaseUrl());
    return url.protocol === "https:" ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** `https:` na 443, e host da lista. Endereço interno do FZAP não passa. */
export function hostDaFotoPermitido(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (host === hostDoFzapPublico()) return true;
  return SUFIXOS_DE_HOST_DA_FOTO.some(
    (sufixo) => host === sufixo.slice(1) || host.endsWith(sufixo),
  );
}

/** Foto de perfil é pequena; acima disto é resposta errada. */
export const TETO_DE_BYTES_DA_FOTO = 2 * 1024 * 1024;
/**
 * `image/*` raster só. SVG é imagem e é script: no bucket, servido de volta,
 * vira XSS armazenado. Os CDNs das fotos entregam JPEG (às vezes WebP).
 */
export const MIMES_DA_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Cabe no orçamento do lote do cron (ver `PRAZO_DO_LOTE_MS` na rota). */
export const PRAZO_DO_DOWNLOAD_DA_FOTO_MS = 10_000;

/**
 * Baixa a foto com a mesma cerca do anexo do Direct: allowlist acima, IP
 * resolvido conferido e fixado, redirecionamento à mão (cada salto reconferido),
 * prazo total, teto de bytes contado DURANTE a leitura e `content-type` de imagem
 * raster (`MIMES_DA_FOTO`) exigido antes de ler o corpo. Lança em qualquer recusa; a mensagem leva só o
 * host, nunca o caminho assinado.
 */
export function baixarFotoDePerfil(
  url: string,
  testes: Pick<OpcoesDoDownload, "fetchImpl" | "conferirDestino" | "timeoutMs"> = {},
): Promise<{ buffer: Buffer; mime: string }> {
  return baixarMidiaDaMeta(url, {
    hostPermitido: hostDaFotoPermitido,
    tetoBytes: TETO_DE_BYTES_DA_FOTO,
    timeoutMs: PRAZO_DO_DOWNLOAD_DA_FOTO_MS,
    aceitaMime: (mime) => MIMES_DA_FOTO.has(mime),
    ...testes,
  });
}

/**
 * O filtro da varredura num `or` SÓ, explícito: (tem identidade de WhatsApp OU
 * IGSID) E (nunca buscado OU buscado antes de `cutoff`). Dois `.or()` no
 * builder viram dois parâmetros `or=` na URL, e a combinação deles fica
 * implícita no servidor; aqui o AND está escrito.
 */
export function filtroDaVarreduraDeFotos(cutoffIso: string): string {
  return (
    "and(" +
    "or(wa_identity.not.is.null,instagram_igsid.not.is.null)," +
    `or(avatar_updated_at.is.null,avatar_updated_at.lt.${cutoffIso})` +
    ")"
  );
}
