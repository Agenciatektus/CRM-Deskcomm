import { describe, expect, it } from "vitest";

import {
  IMPLANTACAO,
  LIMITES,
  PLANO_COM_IA,
  PLANO_SEM_IA,
  calculaTime,
  custoComIA,
  custoHoje,
  lerCampo,
  mesesParaPagarImplantacao,
  perdaDoVacuo,
} from "../../site/lib/conta";

describe("conta do time (LP)", () => {
  it("custo de hoje = N x C", () => {
    expect(custoHoje(3, 2800)).toBe(8400);
    expect(custoHoje(0, 2800)).toBe(0);
  });

  it("custo com IA = S x C + plano (+ IA própria só no plano sem IA)", () => {
    expect(custoComIA(1, 2800, "com-ia", 0)).toBe(2800 + PLANO_COM_IA);
    expect(custoComIA(1, 2800, "com-ia", 999)).toBe(2800 + PLANO_COM_IA);
    expect(custoComIA(1, 2800, "sem-ia", 200)).toBe(2800 + PLANO_SEM_IA + 200);
  });

  it("exemplo hipotético: 3 atendentes, R$ 2.800, 1 na supervisão, plano com IA", () => {
    const r = calculaTime({ atendentes: 3, custoPorAtendente: 2800, supervisao: 1, plano: "com-ia", custoIA: 0 });
    expect(r).toEqual({
      hoje: 8400,
      comIA: 3197,
      economiaMes: 5203,
      economiaAno: 62436,
      mesesParaPagar: Math.ceil(IMPLANTACAO / 5203),
    });
    expect(r?.mesesParaPagar).toBe(1);
  });

  it("meses para pagar a implantação arredonda para cima e só existe com economia positiva", () => {
    expect(mesesParaPagarImplantacao(100)).toBe(13);
    expect(mesesParaPagarImplantacao(1297)).toBe(1);
    expect(mesesParaPagarImplantacao(0)).toBeNull();
    expect(mesesParaPagarImplantacao(-50)).toBeNull();
    expect(mesesParaPagarImplantacao(Number.NaN)).toBeNull();
  });

  it("economia negativa é devolvida como é, sem meses para pagar", () => {
    const r = calculaTime({ atendentes: 1, custoPorAtendente: 1000, supervisao: 1, plano: "com-ia", custoIA: 0 });
    expect(r?.economiaMes).toBe(-397);
    expect(r?.economiaAno).toBe(-4764);
    expect(r?.mesesParaPagar).toBeNull();
  });

  it("recusa supervisão maior que o time, zero atendentes e fracionados", () => {
    const base = { custoPorAtendente: 2000, plano: "com-ia" as const, custoIA: 0 };
    expect(calculaTime({ ...base, atendentes: 2, supervisao: 3 })).toBeNull();
    expect(calculaTime({ ...base, atendentes: 0, supervisao: 0 })).toBeNull();
    expect(calculaTime({ ...base, atendentes: 2.5, supervisao: 1 })).toBeNull();
  });

  it("recusa NaN, Infinity, negativos e acima do teto", () => {
    const ok = { atendentes: 2, custoPorAtendente: 2000, supervisao: 1, plano: "sem-ia" as const, custoIA: 50 };
    expect(calculaTime(ok)).not.toBeNull();
    expect(calculaTime({ ...ok, custoPorAtendente: Number.NaN })).toBeNull();
    expect(calculaTime({ ...ok, custoPorAtendente: Infinity })).toBeNull();
    expect(calculaTime({ ...ok, custoPorAtendente: -1 })).toBeNull();
    expect(calculaTime({ ...ok, custoIA: -1 })).toBeNull();
    expect(calculaTime({ ...ok, custoPorAtendente: LIMITES.custoPorAtendente + 1 })).toBeNull();
    expect(calculaTime({ ...ok, atendentes: LIMITES.atendentes + 1 })).toBeNull();
  });
});

describe("lerCampo", () => {
  it("separa vazio, erro e ok", () => {
    expect(lerCampo("  ", 10)).toEqual({ estado: "vazio" });
    expect(lerCampo("12,5", 100)).toEqual({ estado: "ok", valor: 12.5 });
    expect(lerCampo("2.800", 1e6)).toEqual({ estado: "ok", valor: 2800 });
    expect(lerCampo("1.500,50", 1e6)).toEqual({ estado: "ok", valor: 1500.5 });
    expect(lerCampo("2800", 1e6)).toEqual({ estado: "ok", valor: 2800 });
    expect(lerCampo("0x10", 1e6)).toEqual({ estado: "erro", motivo: "invalido" });
    expect(lerCampo("1e3", 1e6)).toEqual({ estado: "erro", motivo: "invalido" });
    expect(lerCampo("2.80", 1e6)).toEqual({ estado: "erro", motivo: "invalido" });
    expect(lerCampo("-5", 1e6).estado).toBe("erro");
    expect(lerCampo("abc", 10)).toEqual({ estado: "erro", motivo: "invalido" });
    expect(lerCampo("Infinity", 10)).toEqual({ estado: "erro", motivo: "invalido" });
    expect(lerCampo("-1", 10)).toEqual({ estado: "erro", motivo: "negativo" });
    expect(lerCampo("11", 10)).toEqual({ estado: "erro", motivo: "muito-alto" });
    expect(lerCampo("2,5", 10, true)).toEqual({ estado: "erro", motivo: "fracionado" });
  });
});

describe("conta do vácuo (movida para o mesmo módulo)", () => {
  it("conversas x fatia% x ticket", () => {
    expect(perdaDoVacuo(200, 30, 1500)).toBe(90000);
    expect(perdaDoVacuo(0, 30, 1500)).toBe(0);
  });
  it("ticket digitado com milhar em pt-BR vira o número certo", () => {
    const t = lerCampo("1.500", LIMITES.ticket);
    expect(t).toEqual({ estado: "ok", valor: 1500 });
    expect(perdaDoVacuo(200, 30, t.estado === "ok" ? t.valor : -1)).toBe(90000);
  });
  it("fatia acima de 100, negativos e não finitos viram null", () => {
    expect(perdaDoVacuo(200, 101, 1500)).toBeNull();
    expect(perdaDoVacuo(-1, 30, 1500)).toBeNull();
    expect(perdaDoVacuo(200, Number.NaN, 1500)).toBeNull();
    expect(perdaDoVacuo(LIMITES.conversas, 100, Infinity)).toBeNull();
  });
});
