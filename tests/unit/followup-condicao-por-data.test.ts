import { describe, expect, it } from "vitest";

import {
  avaliarDataRelativa,
  diaDoValor,
  diaNoFuso,
  ehOpDeData,
} from "../../lib/followup/condicao-por-data";
import { conditionCheckSchema } from "../../lib/followup/graph-schema";
import { comparador } from "../../lib/followup/vocabulario";

/**
 * Item 14 — condição por data relativa, para o fluxo saber se o período de
 * teste terminou.
 *
 * O vocabulário de condição tinha quatro campos e nenhum falava de tempo: um
 * fluxo de "cliente em teste sem retorno" disparava por silêncio, que é outra
 * pergunta, e podia cobrar no meio do período de avaliação.
 *
 * As duas exigências escritas do dono:
 *  - o caso "o teste termina HOJE" conta como terminado;
 *  - campo ausente ou inválido IMPEDE o envio, nunca autoriza por suposição.
 */

/** 15/10/2026, 23h de Brasília — em UTC já é dia 16. É o caso que separa as réguas. */
const NOITE_DE_BRASILIA = new Date("2026-10-16T02:00:00Z");
const MEIO_DIA = new Date("2026-10-15T15:00:00Z");
const SP = "America/Sao_Paulo";

describe("diaNoFuso — o dia de calendário é o da organização, não o de UTC", () => {
  it("23h de Brasília ainda é dia 15, embora em UTC já seja 16", () => {
    expect(diaNoFuso(NOITE_DE_BRASILIA, SP)).toEqual({ ano: 2026, mes: 10, dia: 15 });
    expect(diaNoFuso(NOITE_DE_BRASILIA, "UTC")).toEqual({ ano: 2026, mes: 10, dia: 16 });
  });

  it("fuso inválido ou ausente cai no padrão do produto, sem lançar", () => {
    expect(diaNoFuso(MEIO_DIA, "Marte/Olympus")).toEqual({ ano: 2026, mes: 10, dia: 15 });
    expect(diaNoFuso(MEIO_DIA, null)).toEqual({ ano: 2026, mes: 10, dia: 15 });
    expect(diaNoFuso(MEIO_DIA, undefined)).toEqual({ ano: 2026, mes: 10, dia: 15 });
  });
});

describe("diaDoValor — o que conta como data", () => {
  it("aceita data pura e ISO com hora", () => {
    expect(diaDoValor("2026-10-15")).toEqual({ ano: 2026, mes: 10, dia: 15 });
    expect(diaDoValor("2026-10-15T23:30:00-03:00")).toEqual({ ano: 2026, mes: 10, dia: 15 });
    expect(diaDoValor(" 2026-10-15 ")).toEqual({ ano: 2026, mes: 10, dia: 15 });
  });

  it("recusa data IMPOSSÍVEL em vez de normalizar em silêncio", () => {
    // `Date.UTC` viraria 3 de março e a regra passaria a valer sobre uma data
    // que não existe.
    expect(diaDoValor("2026-02-31")).toBeNull();
    expect(diaDoValor("2026-13-01")).toBeNull();
  });

  it("recusa o que não é data", () => {
    expect(diaDoValor(undefined)).toBeNull();
    expect(diaDoValor(null)).toBeNull();
    expect(diaDoValor("")).toBeNull();
    expect(diaDoValor("em breve")).toBeNull();
    expect(diaDoValor(15)).toBeNull();
    expect(diaDoValor({ fim: "2026-10-15" })).toBeNull();
    expect(diaDoValor(new Date("nada"))).toBeNull();
  });
});

describe("passou_ha — o período de teste terminou?", () => {
  const fimDoTeste = (data: string, dias: number, agora = MEIO_DIA) =>
    avaliarDataRelativa({ valor: data, op: "passou_ha", dias, agora, fuso: SP });

  it("A DATA DE TÉRMINO É HOJE e o prazo é 0: TERMINOU", () => {
    expect(fimDoTeste("2026-10-15", 0)).toBe(true);
  });

  it("termina hoje às 23h locais: ainda é hoje, e terminou", () => {
    expect(fimDoTeste("2026-10-15", 0, NOITE_DE_BRASILIA)).toBe(true);
  });

  it("termina amanhã: NÃO terminou — e é aqui que o fuso decide", () => {
    expect(fimDoTeste("2026-10-16", 0)).toBe(false);
    // Às 23h de Brasília, em UTC já é dia 16; lido em UTC, um teste que termina
    // no dia 16 leria como terminado três horas antes da hora.
    expect(fimDoTeste("2026-10-16", 0, NOITE_DE_BRASILIA)).toBe(false);
    expect(
      avaliarDataRelativa({
        valor: "2026-10-16",
        op: "passou_ha",
        dias: 0,
        agora: NOITE_DE_BRASILIA,
        fuso: "UTC",
      }),
    ).toBe(true);
  });

  it("passou há 3 dias: cumpre prazo de 0, 1, 2 e 3; não cumpre 4", () => {
    expect(fimDoTeste("2026-10-12", 0)).toBe(true);
    expect(fimDoTeste("2026-10-12", 3)).toBe(true);
    expect(fimDoTeste("2026-10-12", 4)).toBe(false);
  });
});

describe("falta_para — o toque ANTES do vencimento", () => {
  const falta = (data: string, dias: number) =>
    avaliarDataRelativa({ valor: data, op: "falta_para", dias, agora: MEIO_DIA, fuso: SP });

  it("faltam 3 dias: cumpre 0, 1, 2 e 3; não cumpre 4", () => {
    expect(falta("2026-10-18", 3)).toBe(true);
    expect(falta("2026-10-18", 4)).toBe(false);
    expect(falta("2026-10-18", 0)).toBe(true);
  });

  it("data que já passou não cumpre nenhum prazo futuro", () => {
    expect(falta("2026-10-10", 0)).toBe(false);
  });
});

describe("ausência e lixo NÃO autorizam envio", () => {
  const casos: Array<[string, unknown]> = [
    ["campo nunca preenchido", undefined],
    ["campo apagado", null],
    ["texto vazio", ""],
    ["texto livre", "quando der"],
    ["data impossível", "2026-02-31"],
    ["número", 20261015],
    ["objeto", { quando: "2026-10-15" }],
  ];

  for (const [nome, valor] of casos) {
    it(`${nome}: as DUAS direções respondem false`, () => {
      expect(avaliarDataRelativa({ valor, op: "passou_ha", dias: 0, agora: MEIO_DIA, fuso: SP })).toBe(false);
      expect(avaliarDataRelativa({ valor, op: "falta_para", dias: 0, agora: MEIO_DIA, fuso: SP })).toBe(false);
    });
  }

  it("prazo que não é número de 0 para cima também responde false", () => {
    const base = { valor: "2026-10-01", op: "passou_ha" as const, agora: MEIO_DIA, fuso: SP };
    expect(avaliarDataRelativa({ ...base, dias: -1 })).toBe(false);
    expect(avaliarDataRelativa({ ...base, dias: "dois" })).toBe(false);
    expect(avaliarDataRelativa({ ...base, dias: Number.NaN })).toBe(false);
  });
});

describe("o contrato da regra no grafo", () => {
  const base = { field: "lead_date", op: "passou_ha", value: 0, key: "fim_teste" };

  it("aceita a regra do caso real", () => {
    expect(conditionCheckSchema.safeParse(base).success).toBe(true);
  });

  it("recusa regra de data SEM o campo que ela lê", () => {
    const { key: _key, ...semKey } = base;
    expect(conditionCheckSchema.safeParse(semKey).success).toBe(false);
    expect(conditionCheckSchema.safeParse({ ...base, key: "   " }).success).toBe(false);
  });

  it("recusa regra de data com operador que não é de data", () => {
    expect(conditionCheckSchema.safeParse({ ...base, op: "eq" }).success).toBe(false);
  });

  it("recusa operador de data em campo que não é de data", () => {
    expect(
      conditionCheckSchema.safeParse({ field: "tag", op: "passou_ha", value: 0 }).success,
    ).toBe(false);
  });

  it("recusa prazo negativo ou em texto", () => {
    expect(conditionCheckSchema.safeParse({ ...base, value: -1 }).success).toBe(false);
    expect(conditionCheckSchema.safeParse({ ...base, value: "0" }).success).toBe(false);
  });

  it("as regras antigas continuam válidas, sem key", () => {
    expect(
      conditionCheckSchema.safeParse({ field: "lead_stage", op: "eq", value: "abc" }).success,
    ).toBe(true);
  });
});

describe("a regra tem frase legível (nada de uuid cru na tela)", () => {
  it("ehOpDeData reconhece só os dois", () => {
    expect(ehOpDeData("passou_ha")).toBe(true);
    expect(ehOpDeData("falta_para")).toBe(true);
    expect(ehOpDeData("eq")).toBe(false);
  });

  it("prazo 0 é dito como «hoje ou já passou», não como «há 0 dias»", () => {
    expect(comparador("lead_date", "passou_ha").frase(0)).toBe("A data do campo é hoje ou já passou");
  });

  it("singular e plural do prazo", () => {
    expect(comparador("lead_date", "passou_ha").frase(1)).toContain("1 dia ");
    expect(comparador("lead_date", "passou_ha").frase(3)).toContain("3 dias");
  });

  it("os dois operadores são OFERECIDOS na regra de data e vetados nas outras", () => {
    expect(comparador("lead_date", "passou_ha").oferecido).toBe(true);
    expect(comparador("lead_date", "falta_para").oferecido).toBe(true);
    expect(comparador("tag", "passou_ha").oferecido).toBe(false);
    expect(comparador("lead_stage", "falta_para").oferecido).toBe(false);
  });
});

describe("o publish recusa regra de data mal montada", () => {
  it("regra sem o campo do negócio é recusada com código próprio", async () => {
    const { validateFlowForPublish } = await import("../../lib/followup/validate-publish");
    const graph = {
      nodes: [
        { id: "t", type: "trigger", label: "Começo", position: { x: 0, y: 0 }, config: {} },
        {
          id: "c",
          type: "condition",
          label: "Teste acabou?",
          position: { x: 0, y: 0 },
          config: { combinator: "and", checks: [{ field: "lead_date", op: "passou_ha", value: 0 }] },
        },
        { id: "f", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } },
      ],
      edges: [
        { id: "e0", source: "t", target: "c", priority: 0, condition: { type: "always" } },
        { id: "e1", source: "c", target: "f", priority: 0, condition: { type: "cond_result", value: true } },
        { id: "e2", source: "c", target: "f", priority: 1, condition: { type: "cond_result", value: false } },
      ],
    };
    const r = validateFlowForPublish(graph as never, {} as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "campo_de_data_ausente")).toBe(true);
  });

  it("com o campo preenchido, a regra de data não é motivo de recusa", async () => {
    const { validateFlowForPublish } = await import("../../lib/followup/validate-publish");
    const graph = {
      nodes: [
        { id: "t", type: "trigger", label: "Começo", position: { x: 0, y: 0 }, config: {} },
        {
          id: "c",
          type: "condition",
          label: "Teste acabou?",
          position: { x: 0, y: 0 },
          config: {
            combinator: "and",
            checks: [{ field: "lead_date", op: "passou_ha", value: 0, key: "fim_teste" }],
          },
        },
        { id: "f", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } },
      ],
      edges: [
        { id: "e0", source: "t", target: "c", priority: 0, condition: { type: "always" } },
        { id: "e1", source: "c", target: "f", priority: 0, condition: { type: "cond_result", value: true } },
        { id: "e2", source: "c", target: "f", priority: 1, condition: { type: "cond_result", value: false } },
      ],
    };
    const r = validateFlowForPublish(graph as never, {} as never);
    const codigos = r.ok ? [] : r.errors.map((e) => e.code);
    expect(codigos).not.toContain("campo_de_data_ausente");
    expect(codigos).not.toContain("empty_check_value");
    // `0` dias é o caso mais comum e não pode cair no "valor vazio".
    expect(codigos).not.toContain("check_value_not_number");
  });
});
