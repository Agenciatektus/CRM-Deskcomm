import { describe, expect, it } from "vitest";

import { sugerirEstorno } from "./estorno";

const DIA = 86_400_000;
const agora = new Date("2026-10-29T12:00:00Z");
const cobranca = (diasAtras: number, estornadoCents = 0, valorCents = 120_000) => ({
  valorCents,
  estornadoCents,
  pagaEm: new Date(agora.getTime() - diasAtras * DIA),
});

describe("sugerirEstorno", () => {
  it("até 7 dias: devolve o saldo inteiro, mensal ou anual", () => {
    expect(sugerirEstorno(cobranca(0), "mes", agora)).toEqual({ cents: 120_000, regra: "arrependimento" });
    expect(sugerirEstorno(cobranca(7), "ano", agora)).toEqual({ cents: 120_000, regra: "arrependimento" });
    expect(sugerirEstorno(cobranca(3, 20_000), "mes", agora).cents).toBe(100_000);
  });

  it("mensal depois dos 7 dias: nada", () => {
    expect(sugerirEstorno(cobranca(8), "mes", agora)).toEqual({ cents: 0, regra: "mensal_sem_estorno" });
  });

  it("anual: devolve os meses que ainda não começaram", () => {
    expect(sugerirEstorno(cobranca(40), "ano", agora)).toEqual({ cents: 100_000, regra: "anual_proporcional" }); // 2 meses iniciados
    expect(sugerirEstorno(cobranca(200), "ano", agora).cents).toBe(50_000); // 7 iniciados, 5/12
    expect(sugerirEstorno(cobranca(400), "ano", agora).cents).toBe(0);
  });

  it("anual: desconta o que já foi estornado e nunca passa do saldo", () => {
    expect(sugerirEstorno(cobranca(40, 30_000), "ano", agora).cents).toBe(70_000);
    expect(sugerirEstorno(cobranca(40, 110_000), "ano", agora).cents).toBe(0);
  });
});
