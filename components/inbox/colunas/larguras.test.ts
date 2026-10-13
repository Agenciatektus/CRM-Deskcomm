import { describe, expect, it } from "vitest";

import { LARGURAS_PADRAO, limitar, lerLarguras, maximoDe, MINIMO_DA_CONVERSA } from "./larguras";

describe("larguras das colunas da Inbox", () => {
  it("prende cada coluna na faixa do protótipo", () => {
    expect(limitar("lista", 100, LARGURAS_PADRAO, 0, true)).toBe(280);
    expect(limitar("lista", 900, LARGURAS_PADRAO, 0, true)).toBe(480);
    expect(limitar("painel", 100, LARGURAS_PADRAO, 0, true)).toBe(300);
    expect(limitar("painel", 900, LARGURAS_PADRAO, 0, true)).toBe(520);
  });

  it("a conversa nunca fica abaixo de 420: a coluna arrastada cede", () => {
    // Cartão de 1200: painel 352, lista pode ir no máximo a 1200 - 420 - 352 = 428.
    expect(maximoDe("lista", LARGURAS_PADRAO, 1200, true)).toBe(428);
    const lista = limitar("lista", 480, LARGURAS_PADRAO, 1200, true);
    expect(1200 - lista - LARGURAS_PADRAO.painel).toBeGreaterThanOrEqual(MINIMO_DA_CONVERSA);
  });

  it("sem painel, a lista só disputa com a conversa", () => {
    expect(maximoDe("lista", LARGURAS_PADRAO, 800, false)).toBe(380);
  });

  it("o salvo estranho volta ao padrão, coluna por coluna", () => {
    expect(lerLarguras(null)).toEqual(LARGURAS_PADRAO);
    expect(lerLarguras("{quebrado")).toEqual(LARGURAS_PADRAO);
    expect(lerLarguras(JSON.stringify({ lista: 9999, painel: 400 }))).toEqual({ lista: 340, painel: 400 });
    expect(lerLarguras(JSON.stringify({ lista: 300, painel: "x" }))).toEqual({ lista: 300, painel: 352 });
  });
});
