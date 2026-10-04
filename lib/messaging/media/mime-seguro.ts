/**
 * O mime que se GUARDA e o que se SERVE — nunca o que o remetente/CDN declarou
 * às cegas (P2-3 do @Cassio_SecRev na #79).
 *
 * O `content-type` do download vem de fora (CDN da Meta, servidor do canal, o
 * próprio cliente que mandou o "documento"). Guardado e servido como veio, um
 * `text/html` ou `image/svg+xml` abre no navegador do atendente como página —
 * SVG executa script. Por isso:
 *
 *  - só se guarda o mime de quem a tela EXIBE: imagem (exceto SVG), áudio,
 *    vídeo e PDF. O resto vira `application/octet-stream`;
 *  - na hora de servir, o que não é exibível sai com
 *    `Content-Disposition: attachment` (baixa, não renderiza) e `nosniff`.
 *
 * Vale para todos os canais: o worker de mídia é um só.
 */

export const MIME_GENERICO = "application/octet-stream";

function base(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/** A tela pode mostrar isto inline (imagem, áudio, vídeo, PDF) — SVG não. */
export function mimeExibivel(mime: string | null | undefined): boolean {
  const m = base(mime);
  if (m === "image/svg+xml" || m.includes("svg")) return false;
  if (/^(image|audio|video)\/[a-z0-9.+-]+$/.test(m)) return true;
  return m === "application/pdf";
}

/** O mime a GRAVAR: o declarado se exibível, senão o genérico. */
export function mimeSeguroParaGuardar(mime: string | null | undefined): string {
  return mimeExibivel(mime) ? base(mime) : MIME_GENERICO;
}
