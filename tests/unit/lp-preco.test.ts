import { describe, expect, it } from "vitest";

import { OFERTA } from "../../site/lib/conteudo";
import {
  IMPLANTACAO_CENTAVOS,
  IMPLANTACAO_PIX_CENTAVOS,
  anualCentavos,
  equivalenteMensalCentavos,
  mensagemDeAssinatura,
  parcelaImplantacaoCentavos,
  reaisDeCentavos,
  totalPrimeirosMesesCentavos,
} from "../../site/lib/preco";

const norm = (s: string) => s.replace(/ /g, " ");

describe("preços da LP", () => {
  it("anual com 15% de desconto: R$ 4.049,40 e R$ 1.601,40 por ano", () => {
    expect(anualCentavos("com-ia")).toBe(404_940);
    expect(anualCentavos("sem-ia")).toBe(160_140);
  });

  it("equivalente mensal do anual: R$ 337,45 e R$ 133,45", () => {
    expect(equivalenteMensalCentavos("com-ia")).toBe(33_745);
    expect(equivalenteMensalCentavos("sem-ia")).toBe(13_345);
  });

  it("Pix na implantação: desconto igual à taxa do cartão em 3x (4% + R$ 0,60), e a copy mostra o mesmo valor", () => {
    const taxaCartao3x = Math.round(IMPLANTACAO_CENTAVOS * 0.04) + 60;
    const taxaPix = 80;
    expect(IMPLANTACAO_PIX_CENTAVOS).toBe(IMPLANTACAO_CENTAVOS - (taxaCartao3x - taxaPix));
    expect(norm(OFERTA.implantacao.parcelas)).toContain(norm(reaisDeCentavos(IMPLANTACAO_PIX_CENTAVOS)));
  });

  it("implantação em 3x de R$ 432,33 e total do 1º ao 3º mês no mensal", () => {
    expect(parcelaImplantacaoCentavos()).toBe(43_233);
    expect(totalPrimeirosMesesCentavos("com-ia")).toBe(82_933);
    expect(totalPrimeirosMesesCentavos("sem-ia")).toBe(58_933);
  });

  it("3 parcelas arredondadas somam 1 centavo a menos que a implantação, por isso a tela não mostra a parcela exata", () => {
    expect(parcelaImplantacaoCentavos() * 3).toBe(129_699);
  });

  it("formata inteiros sem centavos e fracionados com centavos", () => {
    expect(norm(reaisDeCentavos(39_700))).toBe("R$ 397");
    expect(norm(reaisDeCentavos(33_745))).toBe("R$ 337,45");
    expect(norm(reaisDeCentavos(404_940))).toBe("R$ 4.049,40");
    expect(norm(reaisDeCentavos(82_933))).toBe("R$ 829,33");
  });

  it("mensagem do WhatsApp leva período e implantação", () => {
    expect(mensagemDeAssinatura("com-ia", "mensal", false)).toBe("Oi, quero assinar o Verdash CRM com IA, no plano mensal.");
    expect(mensagemDeAssinatura("sem-ia", "anual", true)).toBe(
      "Oi, quero assinar o Verdash CRM sem IA, no plano anual, com implantação.",
    );
  });
});
