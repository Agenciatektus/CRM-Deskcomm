import { describe, expect, it } from "vitest";

import { inversoDaAcao } from "./useEstadoDaConversa";

/** E2/E3: só há "Desfazer" onde o inverso devolve exatamente o estado anterior. */
describe("inversoDaAcao", () => {
  it("fixar, não lida e silenciar têm inverso", () => {
    expect(inversoDaAcao({ tipo: "fixar" })).toEqual({ tipo: "desafixar" });
    expect(inversoDaAcao({ tipo: "desafixar" })).toEqual({ tipo: "fixar" });
    expect(inversoDaAcao({ tipo: "marcar_nao_lida" })).toEqual({ tipo: "desmarcar_nao_lida" });
    expect(inversoDaAcao({ tipo: "desmarcar_nao_lida" })).toEqual({ tipo: "marcar_nao_lida" });
    expect(inversoDaAcao({ tipo: "silenciar", duracao: "8h" })).toEqual({ tipo: "reativar_som" });
  });

  it("reativar o som não tem inverso: a duração anterior não é conhecida", () => {
    expect(inversoDaAcao({ tipo: "reativar_som" })).toBeNull();
  });
});
