import { describe, expect, it } from "vitest";

import type { MarcaDeSaida } from "@/lib/branding/saida";

import { buildAvisoDeTrocaDeEmail } from "./aviso-de-troca-de-email";

const MARCA = { nome: "Verdash", logoUrl: null, accent: "#000000", accentFg: "#ffffff", origens: { nome: "padrao", cor: "padrao" } } as MarcaDeSaida;

describe("aviso de troca de e-mail", () => {
  it("usa o layout, diz a data e não leva endereço nenhum", () => {
    const e = buildAvisoDeTrocaDeEmail({ marca: MARCA, data: "05/10/2026 14:00", idioma: "pt-BR" });
    expect(e.subject).toBe("O e-mail de login da sua conta foi trocado");
    expect(e.html).toContain("bgcolor=");
    expect(e.html).toContain("05/10/2026 14:00");
    expect(e.text).toContain("fale com o administrador da sua empresa");
    expect(e.html).not.toMatch(/w@w/);
    expect(e.subject + e.html + e.text).not.toMatch(/[—–·]/);
  });

  it("segue o idioma de quem recebe", () => {
    const e = buildAvisoDeTrocaDeEmail({ marca: MARCA, data: "05/10/2026", idioma: "es" });
    expect(e.subject).not.toBe("O e-mail de login da sua conta foi trocado");
  });
});
