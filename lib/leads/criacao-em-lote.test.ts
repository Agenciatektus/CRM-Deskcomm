/**
 * Criação de card em LOTE não acorda o gatilho "Lead criado".
 *
 * O que este teste protege: um valor novo na lista é o que impede N mensagens
 * proativas de saírem de uma vez. A planilha já estava na lista; a campanha com
 * passos (9037) entrou, e o custo de esquecer é o gatilho MANDANDO — ele não
 * reclama, não falha, e ninguém descobre pela tela.
 */
import { describe, expect, it } from "vitest";

import { ORIGEM_CAMPANHA } from "@/lib/campanhas/origem-do-lead";

import { ORIGENS_DE_CRIACAO_EM_LOTE, criacaoEmLote } from "./criacao-em-lote";
import { ORIGEM_DA_PLANILHA } from "./planilha";

describe("criacaoEmLote", () => {
  it("reconhece as duas origens em lote de hoje", () => {
    expect(criacaoEmLote(ORIGEM_DA_PLANILHA)).toBe(true);
    expect(criacaoEmLote(ORIGEM_CAMPANHA)).toBe(true);
  });

  it("não reconhece criação de UM card por vez", () => {
    // Cadastro na tela, API e a conversa que abre o primeiro card QUEREM o
    // gatilho: é para isso que ele existe.
    expect(criacaoEmLote("manual")).toBe(false);
    expect(criacaoEmLote(undefined)).toBe(false);
    expect(criacaoEmLote(null)).toBe(false);
    expect(criacaoEmLote(42)).toBe(false);
    expect(criacaoEmLote({ via: ORIGEM_DA_PLANILHA })).toBe(false);
  });

  it("a lista contém exatamente as origens declaradas", () => {
    expect([...ORIGENS_DE_CRIACAO_EM_LOTE].sort()).toEqual(
      [ORIGEM_DA_PLANILHA, ORIGEM_CAMPANHA].sort(),
    );
  });
});
