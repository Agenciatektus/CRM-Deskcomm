/**
 * O que a VISÃO recebe — e quanto ela pode devolver.
 *
 * Até aqui a foto ia ao modelo do jeito que chegou (até os 50 MB do bucket) e a
 * resposta não tinha teto de saída. As duas pontas são cobradas: a imagem vira
 * tokens de entrada proporcionais à resolução, e a descrição, tokens de saída.
 *
 *  - A imagem é REDUZIDA antes de sair: lado maior de
 *    `LADO_MAIOR_DA_IMAGEM_PARA_IA_PX`, JPEG. O original continua guardado no
 *    Storage, intocado: só o envio à IA muda.
 *  - Se a redução falhar (sharp ausente, arquivo que não decodifica, bomba de
 *    pixels), a foto NÃO sai: o chamador trata como não lida, com motivo. Mandar
 *    o original gigante seria exatamente o gasto que esta trava existe para impedir.
 *  - A descrição tem teto de saída: `MAX_TOKENS_DA_DESCRICAO_DE_IMAGEM`. O
 *    pedido é de 1-2 frases que entram no contexto do agente; 300 tokens sobram.
 */
import { carregarSharp, LIMITE_DE_PIXELS_DA_ENTRADA } from "@/lib/messaging/media/miniatura";

export const LADO_MAIOR_DA_IMAGEM_PARA_IA_PX = 1024;
export const QUALIDADE_DA_IMAGEM_PARA_IA = 80;
export const MAX_TOKENS_DA_DESCRICAO_DE_IMAGEM = 300;

/** Frase fixa para o aviso da Central quando a redução não deu. */
export const MOTIVO_IMAGEM_NAO_REDUZIDA =
  "não consegui reduzir a imagem antes de enviá-la ao modelo, então ela não foi enviada (o original segue guardado)";

/** A imagem reduzida, ou `null` quando não deu — e aí ela não deve sair. Nunca lança. */
export async function reduzirImagemParaIa(original: Buffer): Promise<{ buffer: Buffer; mime: "image/jpeg" } | null> {
  try {
    const sharp = await carregarSharp();
    if (!sharp) return null;
    // Só o cabeçalho: a bomba de descompressão é recusada antes de decodificar.
    const { width = 0, height = 0 } = await sharp(original, { limitInputPixels: false }).metadata();
    if (width * height === 0 || width * height > LIMITE_DE_PIXELS_DA_ENTRADA) return null;
    const buffer = await sharp(original, { failOn: "none", limitInputPixels: LIMITE_DE_PIXELS_DA_ENTRADA })
      .rotate()
      .resize({
        width: LADO_MAIOR_DA_IMAGEM_PARA_IA_PX,
        height: LADO_MAIOR_DA_IMAGEM_PARA_IA_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      // JPEG não tem transparência: fundo branco em vez de preto no PNG.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: QUALIDADE_DA_IMAGEM_PARA_IA })
      .toBuffer();
    return { buffer, mime: "image/jpeg" };
  } catch {
    return null;
  }
}
