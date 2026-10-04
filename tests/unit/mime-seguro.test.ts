/**
 * O mime que se guarda e o que se serve (P2-3 da #79): só o que a tela exibe
 * mantém o tipo; SVG é tratado como NÃO imagem (executa script).
 */
import { describe, expect, it } from "vitest";

import { MIME_GENERICO, mimeExibivel, mimeSeguroParaGuardar } from "@/lib/messaging/media/mime-seguro";

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
