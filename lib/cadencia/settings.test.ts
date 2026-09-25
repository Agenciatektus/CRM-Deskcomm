import { describe, expect, it } from "vitest";

import { CADENCE_SETTINGS_PADRAO, cadenceSettingsSchema, decidirEspacamento } from "./settings";

const valido = { ...CADENCE_SETTINGS_PADRAO, legal_basis_ref: "LIA-2026-09 prospecção lojistas" };

describe("cadence_settings", () => {
  it("o padrão da tela é válido quando ganha a base legal", () => {
    expect(cadenceSettingsSchema.safeParse(valido).success).toBe(true);
  });

  it("sem base legal não publica (gate LGPD do contato frio)", () => {
    const { legal_basis_ref: _l, ...sem } = valido;
    expect(cadenceSettingsSchema.safeParse(sem).success).toBe(false);
  });

  it("janela que cruza a meia-noite é recusada", () => {
    const r = cadenceSettingsSchema.safeParse({ ...valido, janela: { start: "22:00", end: "06:00", weekdays: [1] } });
    expect(r.success).toBe(false);
  });

  it("espaçamento abaixo do piso anti-ban é recusado", () => {
    const r = cadenceSettingsSchema.safeParse({ ...valido, espacamento: { min_s: 5, max_s: 10 } });
    expect(r.success).toBe(false);
  });

  it("mínimo acima do máximo é recusado", () => {
    const r = cadenceSettingsSchema.safeParse({ ...valido, espacamento: { min_s: 200, max_s: 100 } });
    expect(r.success).toBe(false);
  });

  it("teto de inscrições por dia acima de 500 é recusado", () => {
    expect(cadenceSettingsSchema.safeParse({ ...valido, max_inscricoes_dia: 501 }).success).toBe(false);
  });

  it("chave desconhecida é recusada (strict)", () => {
    expect(cadenceSettingsSchema.safeParse({ ...valido, disparar_agora: true }).success).toBe(false);
  });
});

describe("espaçamento entre envios do número", () => {
  const agora = new Date("2026-09-24T12:00:00Z");

  it("sem envio anterior: libera", () => {
    expect(decidirEspacamento({ agora, ultimoEnvio: null, minMs: 45_000, maxMs: 120_000 })).toEqual({ permite: true });
  });

  it("dentro do intervalo sorteado: adia para último + alvo", () => {
    const ultimo = new Date(agora.getTime() - 10_000);
    const r = decidirEspacamento({ agora, ultimoEnvio: ultimo, minMs: 45_000, maxMs: 120_000, rng: () => 0 });
    expect(r).toEqual({ permite: false, proximoEm: new Date(ultimo.getTime() + 45_000) });
  });

  it("passado o alvo: libera", () => {
    const ultimo = new Date(agora.getTime() - 130_000);
    expect(decidirEspacamento({ agora, ultimoEnvio: ultimo, minMs: 45_000, maxMs: 120_000, rng: () => 0.999 })).toEqual({
      permite: true,
    });
  });

  it("o alvo varia entre tentativas — não vira passo fixo", () => {
    const ultimo = new Date(agora.getTime() - 1_000);
    const alvos = new Set<number>();
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const d = decidirEspacamento({ agora, ultimoEnvio: ultimo, minMs: 45_000, maxMs: 120_000, rng: () => r });
      if (!d.permite) alvos.add(d.proximoEm.getTime());
    }
    expect(alvos.size).toBe(5);
  });
});
