import { describe, expect, it } from "vitest";

import { minutosParaSegundos, segundosParaMinutos } from "./unidades";

describe("conversão minuto↔segundo do intervalo de disparo", () => {
  it("segundos→minutos divide por 60; null continua null", () => {
    expect(segundosParaMinutos(900)).toBe(15);
    expect(segundosParaMinutos(120)).toBe(2);
    expect(segundosParaMinutos(null)).toBeNull();
  });

  it("minutos→segundos multiplica por 60 e ARREDONDA, porque o banco é inteiro", () => {
    expect(minutosParaSegundos(15)).toBe(900);
    expect(minutosParaSegundos(2)).toBe(120);
    expect(minutosParaSegundos(1.5)).toBe(90);
    expect(minutosParaSegundos(null)).toBeNull();
  });

  it("ida e volta do valor seguro do Peterson (15 min) não deriva", () => {
    expect(segundosParaMinutos(minutosParaSegundos(15))).toBe(15);
  });
});
