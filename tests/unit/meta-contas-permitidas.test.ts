import { describe, expect, it } from "vitest";

import {
  contaPermitida,
  contasPermitidas,
  normalizarContaId,
} from "@/lib/plataformas-de-anuncio/contas-permitidas";

describe("contasPermitidas", () => {
  it("oauth com lista: a lista", () => {
    expect(contasPermitidas({ via: "oauth", allowed: ["act_1", "2"], padrao: "act_9" })).toEqual(["act_1", "act_2"]);
  });
  it("oauth só com padrão: [padrão]", () => {
    expect(contasPermitidas({ via: "oauth", allowed: null, padrao: "act_9" })).toEqual(["act_9"]);
  });
  it("oauth sem nada: vazio", () => {
    expect(contasPermitidas({ via: "oauth", allowed: null, padrao: null })).toEqual([]);
  });
  it("manual sem lista: sem restrição; com lista: a lista", () => {
    expect(contasPermitidas({ via: "manual", allowed: null, padrao: "act_9" })).toBeNull();
    expect(contasPermitidas({ via: null, allowed: null, padrao: null })).toBeNull();
    expect(contasPermitidas({ via: "manual", allowed: ["act_3"], padrao: null })).toEqual(["act_3"]);
  });
  it("ids inválidos são descartados e duplicados somem", () => {
    expect(contasPermitidas({ via: "oauth", allowed: ["act_1", "act_1", "x", "act_", 5, "1; drop"], padrao: null })).toEqual(["act_1"]);
    expect(contasPermitidas({ via: "oauth", allowed: ["lixo"], padrao: "act_9" })).toEqual([]);
  });
  it("normaliza e valida", () => {
    expect(normalizarContaId(" ACT_12 ")).toBe("act_12");
    expect(normalizarContaId("act_1a")).toBeNull();
  });
  it("contaPermitida: null libera, lista restringe, lixo nega", () => {
    expect(contaPermitida(null, "act_1")).toBe(true);
    expect(contaPermitida(["act_1"], "act_1")).toBe(true);
    expect(contaPermitida(["act_1"], "act_2")).toBe(false);
    expect(contaPermitida([], "act_1")).toBe(false);
    expect(contaPermitida(undefined as never, "act_1")).toBe(false);
  });
});
