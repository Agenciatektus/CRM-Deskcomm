import { describe, expect, it } from "vitest";

import { lembreteAtivo, opcoesDoLembrete } from "@/lib/inbox/opcoes-do-lembrete";

/**
 * As opções do "Lembrar depois" com o relógio NA MÃO.
 *
 * `agora` é parâmetro: um teste de "Hoje 18:00" que lesse o relógio de verdade
 * passaria de manhã e reprovaria à noite. As datas são montadas com
 * `new Date(y, m, d, h)`, no fuso local, que é o mesmo da regra.
 */
const em = (h: number, min = 0) => new Date(2026, 9, 6, h, min); // terça, 6/10/2026

describe("opcoesDoLembrete", () => {
  it("de tarde: Em 1 hora, Hoje 18:00, Amanhã 9:00 e Em 1 semana", () => {
    const opcoes = opcoesDoLembrete(em(14, 10));
    expect(opcoes.map((o) => o.id)).toEqual(["em_1_hora", "hoje_18", "amanha_9", "em_1_semana"]);
    expect(opcoes[0]!.quando).toEqual(em(15, 10));
    expect(opcoes[1]!.quando).toEqual(em(18, 0));
    expect(opcoes[2]!.quando).toEqual(new Date(2026, 9, 7, 9, 0));
    expect(opcoes[3]!.quando).toEqual(new Date(2026, 9, 13, 14, 10));
  });

  it("depois das 18h, Hoje 18:00 vira Amanhã 9:00, e a repetição sai", () => {
    const opcoes = opcoesDoLembrete(em(19, 30));
    expect(opcoes.map((o) => o.id)).toEqual(["em_1_hora", "amanha_9", "em_1_semana"]);
    expect(opcoes[1]!.rotulo).toBe("Amanhã");
    expect(opcoes[1]!.quando).toEqual(new Date(2026, 9, 7, 9, 0));
    // Nenhuma opção no passado.
    for (const o of opcoes) expect(o.quando.getTime()).toBeGreaterThan(em(19, 30).getTime());
  });

  it("às 18:00 em ponto, Hoje 18:00 já não é futuro", () => {
    expect(opcoesDoLembrete(em(18, 0)).some((o) => o.id === "hoje_18")).toBe(false);
  });

  it("virada de mês: Amanhã e Em 1 semana caem no mês seguinte", () => {
    const fimDoMes = new Date(2026, 9, 31, 10, 0);
    const opcoes = opcoesDoLembrete(fimDoMes);
    expect(opcoes.find((o) => o.id === "amanha_9")!.quando).toEqual(new Date(2026, 10, 1, 9, 0));
    expect(opcoes.find((o) => o.id === "em_1_semana")!.quando).toEqual(new Date(2026, 10, 7, 10, 0));
  });
});

describe("lembreteAtivo", () => {
  it("só vale lembrete no futuro", () => {
    const agora = em(12);
    expect(lembreteAtivo(null, agora)).toBe(false);
    expect(lembreteAtivo(em(11).toISOString(), agora)).toBe(false);
    expect(lembreteAtivo(em(13).toISOString(), agora)).toBe(true);
    expect(lembreteAtivo("lixo", agora)).toBe(false);
  });
});
