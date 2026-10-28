import { describe, expect, it } from "vitest";

import type { MarcaDeSaida } from "@/lib/branding/saida";

import { buildEmailDaCobranca } from "./cobranca";

const MARCA: MarcaDeSaida = {
  nome: "Revenda <Teste>", logoUrl: null, accent: "#336699", accentFg: "#ffffff", origens: { nome: "padrao", cor: "padrao" },
};

describe("e-mail da cobrança", () => {
  it("⭐ título no assunto com 'no {marca}', texto escapado e o botão que paga", () => {
    const e = buildEmailDaCobranca({
      titulo: "Não identificamos o pagamento de 05/10",
      corpo: "Pague <já>",
      marca: MARCA,
      botao: { rotulo: "Pagar agora", href: "https://invoice.stripe.com/i/abc" },
      rodape: "Você recebe este aviso porque administra esta empresa.",
      idioma: "pt-BR",
    });
    expect(e.subject).toBe("Não identificamos o pagamento de 05/10 no Revenda <Teste>");
    expect(e.html).toContain("Pague &lt;já&gt;");
    expect(e.html).toContain('href="https://invoice.stripe.com/i/abc"');
    expect(e.html).toContain(">Cobrança<");
    expect(e.text).toContain("https://invoice.stripe.com/i/abc");
    expect(e.subject + e.html + e.text).not.toMatch(/[—–·]/);
  });

  it("eyebrow própria e aviso entram quando informados", () => {
    const e = buildEmailDaCobranca({ titulo: "t", corpo: "c", marca: MARCA, botao: null, rodape: "r", idioma: "pt-BR", eyebrow: "Suspensão", aviso: "Pague até sexta." });
    expect(e.html).toContain(">Suspensão<");
    expect(e.text).toContain("Atenção: Pague até sexta.");
  });

  it("sem botão, nenhum link no corpo", () => {
    const e = buildEmailDaCobranca({ titulo: "t", corpo: "c", marca: MARCA, botao: null, rodape: "r", idioma: "pt-BR" });
    expect(e.html).not.toContain("Se o botão não abrir");
  });
});
