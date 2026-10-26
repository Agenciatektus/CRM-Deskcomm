import { describe, expect, it } from "vitest";

import { LINKS_STRIPE, linkDeAssinatura } from "../../site/lib/checkout";
import { linkWhatsapp } from "../../site/lib/conteudo";
import { mensagemDeAssinatura, type Periodo, type Plano } from "../../site/lib/preco";

const PLANOS: Plano[] = ["com-ia", "sem-ia"];
const PERIODOS: Periodo[] = ["mensal", "anual"];

describe("checkout da LP", () => {
  it("os quatro planos têm um link da Stripe, https e todos diferentes", () => {
    const urls = PLANOS.flatMap((p) => PERIODOS.map((x) => LINKS_STRIPE[p][x]));
    expect(urls).toHaveLength(4);
    for (const u of urls) expect(u).toMatch(/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/);
    expect(new Set(urls).size).toBe(4);
  });

  it("não deixa link de teste da Stripe na página (test_ é só do modo teste)", () => {
    for (const p of PLANOS) for (const x of PERIODOS) expect(LINKS_STRIPE[p][x]).not.toContain("test_");
  });

  it("sem implantação o botão vai ao pagamento do plano e do período escolhidos", () => {
    for (const p of PLANOS) for (const x of PERIODOS) expect(linkDeAssinatura(p, x, false)).toBe(LINKS_STRIPE[p][x]);
  });

  it("com implantação segue pelo WhatsApp, com a mensagem do plano e da implantação", () => {
    for (const p of PLANOS) for (const x of PERIODOS) {
      expect(linkDeAssinatura(p, x, true)).toBe(linkWhatsapp(mensagemDeAssinatura(p, x, true)));
    }
  });
});
