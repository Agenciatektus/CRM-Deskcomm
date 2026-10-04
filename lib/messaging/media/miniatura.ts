/**
 * MINIATURA da imagem recebida (migration 9033).
 *
 * A lista da conversa mostra a imagem numa caixa de ~256 px; baixar a original
 * (às vezes vários MB) para isso é desperdício. Aqui se gera uma webp com lado
 * maior de 512 px (cobre tela 2x), gravada ao lado da original, na pasta da
 * MESMA organização: `{org}/miniaturas/{conversa}/{mensagem}.webp`.
 *
 * Quando NÃO gera (devolve `null`, e a tela usa a original):
 *  - tipo fora de jpeg/png/webp (gif animado perderia a animação; figurinha
 *    não passa por aqui: já chega webp de 512 px, e a animada viraria estática);
 *  - a miniatura não sai menor que a original (imagem que já era pequena);
 *  - o `sharp` não carrega neste processo (binário nativo ausente na imagem):
 *    a mídia continua sendo salva, só sem miniatura, e o retroativo cobre depois.
 */

import type SharpPadrao from "sharp";

export const LADO_MAIOR_DA_MINIATURA_PX = 512;
export const QUALIDADE_DA_MINIATURA = 70;
export const MIMES_COM_MINIATURA: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

/** O caminho da miniatura: sempre dentro da pasta da organização da mensagem. */
export function caminhoDaMiniatura(orgId: string, conversationId: string, messageId: string): string {
  return `${orgId}/miniaturas/${conversationId}/${messageId}.webp`;
}

export function mimeTemMiniatura(mime: string | null | undefined): boolean {
  const base = (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIMES_COM_MINIATURA.has(base);
}

/**
 * Teto de pixels da imagem de ENTRADA (P1 do @Cassio_SecRev na #75).
 *
 * Uma "bomba de descompressão" — PNG de 16384×16384 com poucos KB — decodifica
 * para ~1 GB. Sem teto, o processo morre por falta de memória ANTES de marcar a
 * mídia, o evento volta à fila e morre de novo: laço que para a mídia de TODAS
 * as organizações. 40 Mpx cobre com folga a foto de celular (12–50 Mpx hoje
 * chegam reduzidas pelo WhatsApp a ~2–4 Mpx) e recusa a bomba. Acima do teto
 * não há miniatura; a ORIGINAL continua salva (o teto é só para decodificar).
 */
export const LIMITE_DE_PIXELS_DA_ENTRADA = 40_000_000;

type Sharp = typeof SharpPadrao;
let sharpCarregado: Promise<Sharp | null> | null = null;

/**
 * `sharp` sob demanda, e sem derrubar quem chama se o binário nativo faltar.
 * Uma thread e sem cache: o worker processa uma mídia por vez, e o cache de
 * operações do libvips só segura memória entre mídias que não se repetem.
 */
function carregarSharp(): Promise<Sharp | null> {
  sharpCarregado ??= import("sharp")
    .then((m) => {
      m.default.concurrency(1);
      m.default.cache(false);
      return m.default;
    })
    .catch(() => null);
  return sharpCarregado;
}

export async function gerarMiniatura(
  original: Uint8Array,
  mime: string | null | undefined,
): Promise<Buffer | null> {
  if (!mimeTemMiniatura(mime)) return null;
  const sharp = await carregarSharp();
  if (!sharp) return null;
  // Lê só o CABEÇALHO (não decodifica): a bomba é recusada aqui, pelo tamanho
  // declarado, antes de qualquer pixel ir para a memória.
  const { width = 0, height = 0 } = await sharp(original, { limitInputPixels: false }).metadata();
  if (width * height > LIMITE_DE_PIXELS_DA_ENTRADA) return null;
  const miniatura = await sharp(original, { failOn: "none", limitInputPixels: LIMITE_DE_PIXELS_DA_ENTRADA })
    // Respeita a orientação EXIF da foto do celular antes de reduzir.
    .rotate()
    .resize({
      width: LADO_MAIOR_DA_MINIATURA_PX,
      height: LADO_MAIOR_DA_MINIATURA_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALIDADE_DA_MINIATURA })
    .toBuffer();
  return miniatura.byteLength < original.byteLength ? miniatura : null;
}
