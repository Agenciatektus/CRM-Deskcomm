import { afterEach, describe, expect, it, vi } from "vitest";

import { interpretaWahaHabilitado, wahaHabilitadoValido } from "./habilitado";

describe("interruptor do WAHA nao falha aberto", () => {
  it("ausente = ligado", () => {
    expect(interpretaWahaHabilitado(undefined)).toBe(true);
    expect(wahaHabilitadoValido(undefined)).toBe(true);
  });

  it.each(["true", "1", "yes", "on", "TRUE", " On "])("%s liga", (v) => {
    expect(wahaHabilitadoValido(v)).toBe(true);
    expect(interpretaWahaHabilitado(v)).toBe(true);
  });

  it.each(["false", "0", "no", "off", "FALSE", " No "])("%s desliga", (v) => {
    expect(wahaHabilitadoValido(v)).toBe(true);
    expect(interpretaWahaHabilitado(v)).toBe(false);
  });

  describe.each(["flase", "desligado", "", "   ", "2"])("valor desconhecido %j", (v) => {
    afterEach(() => vi.restoreAllMocks());
    it("o boot recusa (Zod)", () => expect(wahaHabilitadoValido(v)).toBe(false));
    it("onde chega assim mesmo, lê como DESLIGADO", () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      expect(interpretaWahaHabilitado(v)).toBe(false);
    });
  });

  it("o aviso sai uma vez só", async () => {
    vi.resetModules();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { interpretaWahaHabilitado: f } = await import("./habilitado");
    f("flase");
    f("flase");
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});
