// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { lerCorpoComTeto, lerFotoDoFormulario, limparFoto } from "./servidor";

/**
 * O que a foto PERDE antes de ir para o bucket: EXIF/GPS (LGPD — colega da
 * organização baixa o arquivo). E o teto do corpo vale também para quem não
 * declara `content-length` (chunked).
 */

const t = (s: string) => s;

/** Um JPEG de verdade COM EXIF de GPS e autor — o caso da foto de celular. */
async function jpegComGps(): Promise<Uint8Array> {
  const buf = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366aa" } })
    .jpeg()
    .withExif({
      IFD0: { Artist: "Fulana de Tal", Copyright: "segredo-do-autor" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 33/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "46/1 38/1 0/1" },
    })
    .toBuffer();
  return new Uint8Array(buf);
}

async function pngComTexto(): Promise<Uint8Array> {
  const buf = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#ff0000ff" } })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: "segredo-do-autor" } } })
    .toBuffer();
  return new Uint8Array(buf);
}

const temSegredo = (b: Uint8Array) => Buffer.from(b).includes("segredo-do-autor");

describe("limparFoto — EXIF/GPS fora", () => {
  it("controle negativo: o JPEG de entrada TEM o EXIF com GPS (a prova abaixo não é vazia)", async () => {
    const original = await jpegComGps();
    const meta = await sharp(original).metadata();
    expect(meta.exif).toBeDefined();
    expect(temSegredo(original)).toBe(true);
  });

  it("JPEG sai sem EXIF nenhum (nem GPS, nem autor) e continua JPEG", async () => {
    const r = await limparFoto(await jpegComGps(), "image/jpeg");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = await sharp(r.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(temSegredo(r.bytes)).toBe(false);
  });

  it("PNG com metadado sai limpo", async () => {
    const original = await pngComTexto();
    expect(temSegredo(original)).toBe(true);
    const r = await limparFoto(original, "image/png");
    expect(r.ok && temSegredo(r.bytes)).toBe(false);
    expect(r.ok && (await sharp(r.bytes).metadata()).exif).toBeUndefined();
  });

  it("bytes com cabeçalho de PNG mas corpo inválido: recusa (não grava o original)", async () => {
    const falso = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    expect(await limparFoto(falso, "image/png")).toEqual({ ok: false, motivo: "imagem_invalida" });
  });
});

/** Um corpo em stream, SEM content-length — como chega um upload chunked. */
function requisicaoChunked(pedacos: Uint8Array[], contentType = "multipart/form-data; boundary=x"): Request {
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pedacos) c.enqueue(p);
      c.close();
    },
  });
  return new Request("http://localhost/x", {
    method: "POST",
    body: corpo,
    headers: { "content-type": contentType },
    // @ts-expect-error -- `duplex` é exigido pelo undici para corpo em stream
    duplex: "half",
  });
}

describe("corpo com teto durante o stream", () => {
  it("chunked acima do teto: para de ler e devolve null", async () => {
    const pedaco = new Uint8Array(256 * 1024);
    const req = requisicaoChunked([pedaco, pedaco, pedaco, pedaco, pedaco]);
    expect(req.headers.get("content-length")).toBeNull();
    expect(await lerCorpoComTeto(req, 1024 * 1024)).toBeNull();
  });

  it("controle: chunked abaixo do teto é lido inteiro", async () => {
    const pedaco = new Uint8Array(100 * 1024);
    const corpo = await lerCorpoComTeto(requisicaoChunked([pedaco, pedaco]), 1024 * 1024);
    expect(corpo?.byteLength).toBe(200 * 1024);
  });

  it("a rota recusa 413 um upload chunked de mais de 1 MB, sem content-length", async () => {
    const pedaco = new Uint8Array(300 * 1024);
    const r = await lerFotoDoFormulario(requisicaoChunked([pedaco, pedaco, pedaco, pedaco]), t, "rid");
    expect("recusa" in r && r.recusa.status).toBe(413);
  });
});
