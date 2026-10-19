// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_NAME } from "@/lib/branding";
import { gerarIconeDoApp } from "@/lib/branding/icone-do-app";

/**
 * Gera o PNG DE VERDADE, sem mock do `ImageResponse`.
 *
 * Os outros testes do ícone simulam o gerador e passaram com o ícone dando 500
 * em produção: o satori recusa componente dentro de `<svg>` ("Only intrinsic
 * elements are supported inside <svg>"), e só um render real mostra isso. Sem
 * ícone válido, o app instalado no celular fica com o ícone antigo (Deskcomm).
 */
const MARCA_DO_PRODUTO = {
  nome: DEFAULT_APP_NAME,
  logoUrl: null,
  accent: "#1042f6",
  accentFg: "#ffffff",
  origens: { nome: DEFAULT_APP_NAME, cor: "#1042f6" },
};

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47];

describe("ícone do app com a marca do produto", () => {
  it.each([
    [192, false],
    [512, true],
  ] as const)("gera PNG válido em %ipx (maskable=%s)", async (lado, mascaravel) => {
    const png = new Uint8Array(await gerarIconeDoApp(lado, MARCA_DO_PRODUTO, null, { mascaravel }));
    expect(Array.from(png.slice(0, 4))).toEqual(ASSINATURA_PNG);
    expect(png.byteLength).toBeGreaterThan(500);
  });
});
