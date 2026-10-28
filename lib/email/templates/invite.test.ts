import { describe, expect, it } from "vitest";

import type { MarcaDeSaida } from "@/lib/branding/saida";
import { buildInviteEmail } from "@/lib/email/templates/invite";

const MARCA: MarcaDeSaida = {
  nome: "Acme",
  logoUrl: null,
  accent: "#506d48",
  accentFg: "#ffffff",
  origens: { nome: "instalacao", cor: "instalacao" },
};
const URL = "https://app.exemplo.test/team/accept-invite/abc.def";
const base = {
  inviterName: "Ana",
  orgName: "Loja <script>alert(1)</script>",
  acceptUrl: URL,
  role: "admin",
  marca: MARCA,
};

describe("e-mail de convite", () => {
  it("equipe: assunto, botão, link e escape do nome da org", () => {
    const e = buildInviteEmail({ ...base, expiresAt: new Date("2026-11-01T12:00:00Z") });
    expect(e.subject).toBe(`Ana convidou você para a ${base.orgName} no Acme`);
    expect(e.html).toContain("Aceitar convite");
    expect(e.html).toContain(`href="${URL}"`);
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.text).toContain(URL);
  });

  it("compra: variante própria, passos e WhatsApp, validade de 7 dias", () => {
    const iat = new Date("2026-11-01T12:00:00Z");
    const e = buildInviteEmail({
      ...base,
      origem: "compra",
      expiresAt: new Date(iat.getTime() + 7 * 24 * 3600 * 1000),
    });
    expect(e.subject).toBe(`Sua empresa ${base.orgName} está pronta no Acme`);
    expect(e.html).toContain("Definir senha e entrar");
    expect(e.html).toContain("Sua empresa está pronta");
    expect(e.html).toContain("Defina sua senha e entre.");
    expect(e.html).toContain("https://wa.me/5521977357727");
    expect(e.html).toContain("é só ignorar este e-mail");
    expect(e.html).toContain("08/11/2026");
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("Aceitar convite");
  });

  it("sem travessão nem ponto médio", () => {
    for (const origem of ["equipe", "compra"] as const) {
      const e = buildInviteEmail({ ...base, origem, expiresAt: new Date() });
      expect(e.subject + e.text).not.toMatch(/[—–·]/);
      expect(e.html).not.toMatch(/[—–·]/);
    }
  });
});
