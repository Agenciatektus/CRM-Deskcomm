import { describe, expect, it } from "vitest";

import { cssDaMarca, ESCOPO_DA_ORGANIZACAO } from "@/lib/branding/css";
import { resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";

/**
 * A COR DO TEMA ESCURO (#2482) PELO CAMINHO DA ORGANIZAÇÃO — P2 do parecer da #215.
 *
 * A instalação grava `accent_dark_hex` numa coluna com CHECK (0627). A
 * organização grava no jsonb (`settings.branding`), e a função do banco passou a
 * aplicar a mesma régua na 9059 (`tests/invariants/marca-da-organizacao.test.ts`).
 * Este arquivo prende a OUTRA metade: o que está gravado nunca vai cru para o
 * CSS. A semente passa por `derivarMarca`; valor fora da forma vira motivo e o
 * escuro volta a derivar da cor principal.
 */

const INSTALACAO = { app_name: "Revenda", logo_url: null, accent_hex: "#2563eb" };
const AMBIENTE = { APP_NAME: "Do env", APP_ACCENT_HEX: "#123456" };

describe("accent_dark_hex da organização", () => {
  it("válido: vira a semente do escuro, e o CSS sai da derivação", () => {
    const marca = resolverMarcaDaOrganizacao(
      { branding: { accent_hex: "#1c261d", accent_dark_hex: "#8fd19e" } },
      INSTALACAO,
      AMBIENTE,
    );
    expect(marca.origens.cor).toBe("organizacao");
    expect(marca.cor?.corEscura?.semente).toBe("#8fd19e");
    const { css } = cssDaMarca(marca.cor, ESCOPO_DA_ORGANIZACAO);
    expect(css).toBeTruthy();
  });

  it("valor que não é #rrggbb não alcança o CSS: o escuro deriva da principal", () => {
    const injecao = "#fff;}body{display:none";
    const marca = resolverMarcaDaOrganizacao(
      { branding: { accent_hex: "#1c261d", accent_dark_hex: injecao } },
      INSTALACAO,
      AMBIENTE,
    );
    // A principal continua valendo; a segunda semente cai sem derrubá-la.
    expect(marca.cor?.semente).toBe("#1c261d");
    expect(marca.cor?.corEscura).toBeUndefined();
    const { css } = cssDaMarca(marca.cor, ESCOPO_DA_ORGANIZACAO);
    expect(css ?? "").not.toContain("display:none");
    expect(css ?? "").not.toContain(injecao);
  });

  it("sem accent_dark_hex, o resultado é o mesmo de antes da coluna existir", () => {
    const sem = resolverMarcaDaOrganizacao({ branding: { accent_hex: "#1c261d" } }, INSTALACAO, AMBIENTE);
    const nulo = resolverMarcaDaOrganizacao(
      { branding: { accent_hex: "#1c261d", accent_dark_hex: null } },
      INSTALACAO,
      AMBIENTE,
    );
    expect(cssDaMarca(nulo.cor, ESCOPO_DA_ORGANIZACAO).css).toBe(cssDaMarca(sem.cor, ESCOPO_DA_ORGANIZACAO).css);
  });
});
