import { describe, expect, it } from "vitest";

import { initials, siglaDoTelefone } from "./tempo-da-linha";

/**
 * A sigla do avatar por code point. Visto na Inbox da Delicatto: "Grazy Lima 🎤"
 * aparecia como "G\uFFFD", porque `nome[0]`/`slice` cortavam o par substituto
 * do emoji ao meio.
 */
describe("initials", () => {
  it("emoji no fim do nome não entra na sigla nem a corta ao meio", () => {
    expect(initials("Grazy Lima 🎤", "??")).toBe("GL");
  });

  it("emoji colado na palavra e emoji como primeira palavra também ficam de fora", () => {
    expect(initials("🎤Grazy", "??")).toBe("GR");
    expect(initials("✨ Ana Souza", "??")).toBe("AS");
  });

  it("nome só com emoji ou pontuação cai no fallback", () => {
    expect(initials(". ✨", "??")).toBe("??");
    expect(initials("🎤🎤", "+5511")).toBe("+5");
    expect(initials("   ", "??")).toBe("??");
  });

  it("nenhuma sigla carrega metade de um par substituto", () => {
    for (const nome of ["Grazy Lima 🎤", "😀 Bia", "Zé 👍🏽 Silva", "𝓜aria Clara"]) {
      const sigla = initials(nome, "??");
      // Letra fora do plano básico (𝓜) é um par INTEIRO, e vale; o defeito é a
      // metade solta.
      expect(sigla, nome).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
      expect(sigla, nome).not.toContain("\uFFFD");
    }
  });

  it("letra fora do plano básico entra inteira", () => {
    expect(initials("𝓜aria Clara", "??")).toBe("𝓜C");
  });

  it("nome com acento DECOMPOSTO (NFD) dá a sigla com o acento", () => {
    const decomposto = "Ángela Ávila".normalize("NFD");
    expect(decomposto).not.toBe("Ángela Ávila"); // guarda: o caso é mesmo NFD
    expect(initials(decomposto, "??")).toBe("ÁÁ");
  });

  it("letra cuja maiúscula vira duas não faz a sigla crescer", () => {
    const sigla = initials("ßa", "??");
    expect(Array.from(sigla)).toHaveLength(2);
    expect(sigla).toBe("ßA");
  });

  it("CONTROLE: os nomes comuns seguem como antes", () => {
    expect(initials("Maria", "??")).toBe("MA");
    expect(initials("Maria da Silva", "??")).toBe("MS");
    expect(initials("Ângela Ávila", "??")).toBe("ÂÁ");
    expect(initials(null, "11")).toBe("11");
  });
});

describe("siglaDoTelefone (fallback da sigla)", () => {
  it("número brasileiro com DDI dá o DDD, sem o +", () => {
    expect(siglaDoTelefone("+55 21 99812-4410")).toBe("21");
    expect(siglaDoTelefone("5511987654321")).toBe("11");
    expect(siglaDoTelefone("+55 11 3456-7890")).toBe("11");
  });

  it("número de fora ou sem DDI dá os dois primeiros dígitos", () => {
    expect(siglaDoTelefone("+1 415 555 0100")).toBe("14");
    expect(siglaDoTelefone("21998124410")).toBe("21");
  });

  it("sem telefone, ou sem dígitos, cai em ??", () => {
    expect(siglaDoTelefone(null)).toBe("??");
    expect(siglaDoTelefone("+")).toBe("??");
  });

  it("nome só com emoji usa o telefone, e a sigla nunca começa com +", () => {
    expect(initials("🎤✨", siglaDoTelefone("+55 21 99812-4410"))).toBe("21");
    expect(initials(". ✨", siglaDoTelefone("+55 21 99812-4410"))).not.toMatch(/^\+/);
  });
});
