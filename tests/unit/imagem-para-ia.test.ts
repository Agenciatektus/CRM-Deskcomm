import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  LADO_MAIOR_DA_IMAGEM_PARA_IA_PX,
  reduzirImagemParaIa,
} from "@/lib/messaging/media/imagem-para-ia";

const imagem = (width: number, height: number, alpha = false) =>
  sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: { r: 200, g: 30, b: 30, alpha: alpha ? 0.5 : 1 } },
  })
    .png()
    .toBuffer();

describe("a foto que vai à visão é reduzida", () => {
  it("⭐ foto grande sai com lado maior de 1024 px, em JPEG", async () => {
    const r = await reduzirImagemParaIa(await imagem(4000, 3000));
    expect(r).not.toBeNull();
    const meta = await sharp(r!.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(LADO_MAIOR_DA_IMAGEM_PARA_IA_PX);
    expect(r!.mime).toBe("image/jpeg");
  });

  it("controle negativo: foto pequena não é ampliada", async () => {
    const r = await reduzirImagemParaIa(await imagem(300, 200, true));
    const meta = await sharp(r!.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  it("⭐ arquivo que não decodifica devolve null (o original não deve sair)", async () => {
    expect(await reduzirImagemParaIa(Buffer.from("não sou uma imagem"))).toBeNull();
  });
});
