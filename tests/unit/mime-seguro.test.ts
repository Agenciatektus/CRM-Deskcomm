/**
 * O mime que se guarda e o que se serve (P2-3 da #79): só o que a tela exibe
 * mantém o tipo; SVG é tratado como NÃO imagem (executa script).
 */
import { describe, expect, it } from "vitest";

import {
  MIME_GENERICO,
  mimeDeclaradoParaRotulo,
  mimeExibivel,
  mimeSeguroParaGuardar,
} from "@/lib/messaging/media/mime-seguro";
import { anexarUrlsDeMidia, esquecerUrlsAssinadas } from "@/lib/messaging/media/url-assinada";

describe("mimeSeguroParaGuardar", () => {
  it.each([
    ["image/jpeg", "image/jpeg"],
    ["image/webp", "image/webp"],
    ["IMAGE/PNG; charset=binary", "image/png"],
    ["audio/ogg; codecs=opus", "audio/ogg"],
    ["video/mp4", "video/mp4"],
    ["application/pdf", "application/pdf"],
    ["image/svg+xml", MIME_GENERICO],
    ["text/html", MIME_GENERICO],
    ["text/html; charset=utf-8", MIME_GENERICO],
    ["application/xhtml+xml", MIME_GENERICO],
    ["application/javascript", MIME_GENERICO],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", MIME_GENERICO],
    ["", MIME_GENERICO],
  ])("%s → %s", (entrada, saida) => {
    expect(mimeSeguroParaGuardar(entrada)).toBe(saida);
  });

  it("SVG nunca é exibível, em nenhuma grafia", () => {
    expect(mimeExibivel("image/svg+xml")).toBe(false);
    expect(mimeExibivel("IMAGE/SVG+XML; charset=utf-8")).toBe(false);
    expect(mimeExibivel("image/svg")).toBe(false);
  });
});

describe("mimeDeclaradoParaRotulo (a coluna media_mime)", () => {
  it.each([
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["text/html; charset=utf-8", "text/html"],
    ["image/svg+xml", "image/svg+xml"],
    ["<script>", MIME_GENERICO],
    ["", MIME_GENERICO],
  ])("%s → %s", (entrada, saida) => {
    expect(mimeDeclaradoParaRotulo(entrada)).toBe(saida);
  });
});

describe("a LISTA assina como download o que não é exibível (P2-2 da #83)", () => {
  function adminFalso() {
    const chamadas: Array<{ caminhos: string[]; download: boolean }> = [];
    const admin = {
      storage: {
        from: () => ({
          createSignedUrls: async (caminhos: string[], _v: number, opcoes?: { download?: boolean }) => {
            chamadas.push({ caminhos: [...caminhos], download: opcoes?.download === true });
            return {
              data: caminhos.map((c) => ({
                path: c,
                signedUrl: `https://st/${c}${opcoes?.download ? "?download" : ""}`,
                error: null,
              })),
              error: null,
            };
          },
        }),
      },
    };
    return { admin: admin as never, chamadas };
  }

  it("SVG e HTML antigos (coluna com o mime declarado) saem como download; a foto, inline", async () => {
    esquecerUrlsAssinadas();
    const { admin, chamadas } = adminFalso();
    const r = await anexarUrlsDeMidia(admin, [
      { id: "foto", media_storage_path: "org/c/foto.jpg", media_thumb_path: "org/miniaturas/c/foto.webp", media_mime: "image/jpeg" },
      { id: "svg", media_storage_path: "org/c/x.bin", media_thumb_path: null, media_mime: "image/svg+xml" },
      { id: "html", media_storage_path: "org/c/y.bin", media_thumb_path: null, media_mime: "text/html" },
    ]);
    expect(chamadas).toEqual(
      expect.arrayContaining([
        { caminhos: ["org/c/foto.jpg", "org/miniaturas/c/foto.webp"], download: false },
        { caminhos: ["org/c/x.bin", "org/c/y.bin"], download: true },
      ]),
    );
    expect(r.find((m) => m.id === "svg")!.media_signed_url).toContain("?download");
    expect(r.find((m) => m.id === "html")!.media_signed_url).toContain("?download");
    expect(r.find((m) => m.id === "foto")!.media_signed_url).not.toContain("?download");
    expect(r.find((m) => m.id === "foto")!.media_thumb_signed_url).toContain("miniaturas");
  });
});
