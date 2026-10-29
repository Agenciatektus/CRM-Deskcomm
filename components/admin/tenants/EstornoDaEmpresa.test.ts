import { describe, expect, it } from "vitest";

import { centavosDoCampo } from "./EstornoDaEmpresa";

describe("centavosDoCampo", () => {
  it("lê vírgula, ponto decimal e milhar com ponto", () => {
    expect(centavosDoCampo("12,50")).toBe(1250);
    expect(centavosDoCampo("12.50")).toBe(1250);
    expect(centavosDoCampo("1.234,50")).toBe(123_450);
    expect(centavosDoCampo("1234")).toBe(123_400);
  });

  it("recusa vazio, zero, negativo e lixo", () => {
    for (const x of ["", "0", "-5", "abc", "1,2,3"]) expect(centavosDoCampo(x)).toBeNull();
  });
});
