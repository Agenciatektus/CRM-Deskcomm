import { describe, expect, it } from "vitest";

import { marcoDoDia, pendenciaDaConexao } from "@/lib/plataformas-de-anuncio/meta/alerta/marcos";

const AGORA = new Date("2026-10-25T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;
const em = (dias: number) => new Date(AGORA.getTime() + dias * DIA).toISOString();

describe("marcoDoDia", () => {
  it("antes de vencer: d7, d3 e d1 por janela; fora delas, nada", () => {
    expect(marcoDoDia(10)).toBeNull();
    expect(marcoDoDia(8)).toBeNull();
    expect(marcoDoDia(7)).toBe("d7");
    expect(marcoDoDia(6)).toBe("d7");
    expect(marcoDoDia(3)).toBe("d3");
    expect(marcoDoDia(2)).toBe("d3");
    expect(marcoDoDia(1)).toBe("d1");
  });

  it("depois de vencido: a cada 3 dias até 30 e a cada 7 daí em diante", () => {
    expect(marcoDoDia(0)).toBe("x0");
    expect(marcoDoDia(-2)).toBe("x0");
    expect(marcoDoDia(-3)).toBe("x3");
    expect(marcoDoDia(-29)).toBe("x27");
    expect(marcoDoDia(-30)).toBe("x28");
    expect(marcoDoDia(-36)).toBe("x35");
    expect(marcoDoDia(-37)).toBe("x35");
    expect(marcoDoDia(-42)).toBe("x42");
  });
});

describe("pendenciaDaConexao", () => {
  const base = { token_expires_at: null, needs_reconnect: false, needs_reconnect_desde: null };

  it("token colado à mão, sem validade conhecida, não gera alerta", () => {
    expect(pendenciaDaConexao(base, AGORA)).toBeNull();
  });

  it("vencimento: janela é a data do vencimento (outro ciclo avisa de novo)", () => {
    const p = pendenciaDaConexao({ ...base, token_expires_at: em(2) }, AGORA);
    expect(p).toMatchObject({ marco: "d3", recusada: false, janela: "vence:2026-10-27" });
  });

  it("recusa da Meta alerta mesmo com o token ainda dentro da validade, ancorada em needs_reconnect_desde", () => {
    const p = pendenciaDaConexao(
      { token_expires_at: em(20), needs_reconnect: true, needs_reconnect_desde: em(-4) },
      AGORA,
    );
    expect(p).toMatchObject({ marco: "x3", recusada: true, janela: "recusa:2026-10-21" });
  });
});
