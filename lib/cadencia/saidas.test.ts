import { describe, expect, it } from "vitest";

import { SAIDAS_PADRAO, motivoDeSaida, saidasDe, type FatosDaSaida } from "./saidas";
import { rngDaSemente } from "./settings";

const aberto = (extra: Partial<NonNullable<FatosDaSaida["lead"]>> = {}): FatosDaSaida => ({
  lead: { stage_id: "etapa-1", status: "open", tags: [], ...extra },
  tagsDoContato: [],
  humanoFalouDepois: false,
});

describe("motivoDeSaida", () => {
  it("negócio aberto, sem nada configurado batendo: a régua segue", () => {
    expect(motivoDeSaida(SAIDAS_PADRAO, aberto())).toBeNull();
  });

  it("ganho e perdido encerram com o padrão; desligando 'ao fechar', não", () => {
    expect(motivoDeSaida(SAIDAS_PADRAO, aberto({ status: "won" }))).toBe("saida_negocio_ganho");
    expect(motivoDeSaida(SAIDAS_PADRAO, aberto({ status: "lost" }))).toBe("saida_negocio_perdido");
    expect(motivoDeSaida({ ...SAIDAS_PADRAO, ao_fechar: false }, aberto({ status: "won" }))).toBeNull();
  });

  it("negócio apagado conta como fechado", () => {
    expect(motivoDeSaida(SAIDAS_PADRAO, { lead: null, tagsDoContato: [], humanoFalouDepois: false })).toBe(
      "saida_negocio_removido",
    );
  });

  it("etapa de saída encerra", () => {
    const saidas = { ...SAIDAS_PADRAO, etapas: ["etapa-9"] };
    expect(motivoDeSaida(saidas, aberto({ stage_id: "etapa-9" }))).toBe("saida_etapa");
    expect(motivoDeSaida(saidas, aberto({ stage_id: "etapa-1" }))).toBeNull();
  });

  it("etiqueta compara sem caixa e sem espaço, no negócio OU no contato", () => {
    const saidas = { ...SAIDAS_PADRAO, etiquetas: ["Reunião agendada"] };
    expect(motivoDeSaida(saidas, aberto({ tags: ["  reunião AGENDADA "] }))).toBe("saida_etiqueta");
    expect(motivoDeSaida(saidas, { ...aberto(), tagsDoContato: ["Reunião agendada"] })).toBe("saida_etiqueta");
    expect(motivoDeSaida(saidas, aberto({ tags: ["reunião"] }))).toBeNull();
  });

  it("uma pessoa do time falou depois da inscrição: encerra, a menos que desligado", () => {
    const fatos = { ...aberto(), humanoFalouDepois: true };
    expect(motivoDeSaida(SAIDAS_PADRAO, fatos)).toBe("saida_humano_assumiu");
    expect(motivoDeSaida({ ...SAIDAS_PADRAO, humano_assumir: false }, fatos)).toBeNull();
  });

  it("o negócio fechado ganha da etiqueta (motivo mais forte primeiro)", () => {
    const saidas = { ...SAIDAS_PADRAO, etiquetas: ["x"] };
    expect(motivoDeSaida(saidas, aberto({ status: "won", tags: ["x"] }))).toBe("saida_negocio_ganho");
  });
});

describe("saidasDe", () => {
  it("cadência gravada antes do campo recebe o padrão (fechar e humano assumir ligados)", () => {
    expect(saidasDe({ janela: {} })).toEqual(SAIDAS_PADRAO);
    expect(saidasDe(null)).toEqual(SAIDAS_PADRAO);
  });

  it("lê o que foi gravado", () => {
    expect(saidasDe({ saidas: { etiquetas: ["a"], etapas: [], ao_fechar: false, humano_assumir: true } }).ao_fechar).toBe(
      false,
    );
  });
});

describe("rngDaSemente", () => {
  it("a mesma semente dá o mesmo sorteio em toda volta; sementes diferentes espalham", () => {
    const a = rngDaSemente("job-1");
    expect(a()).toBe(a());
    expect(rngDaSemente("job-1")()).toBe(rngDaSemente("job-1")());
    const valores = new Set(["job-1", "job-2", "job-3", "job-4", "job-5"].map((s) => rngDaSemente(s)()));
    expect(valores.size).toBeGreaterThan(1);
    for (const v of valores) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
