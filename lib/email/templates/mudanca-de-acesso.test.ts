import { describe, expect, it } from "vitest";

import { buildAvisoDeMudancaDeAcesso, type AvisoDeMudancaDeAcessoOpcoes } from "./mudanca-de-acesso";

const base = { empresa: "Acme", idioma: "pt-BR" as const };
const papel: AvisoDeMudancaDeAcessoOpcoes = { ...base, tipo: "papel_alterado", papel: "manager", papelAnterior: "agent" };
const removido: AvisoDeMudancaDeAcessoOpcoes = { ...base, tipo: "acesso_removido" };
const reativado: AvisoDeMudancaDeAcessoOpcoes = { ...base, tipo: "acesso_reativado" };
const variantes = [papel, removido, reativado];

describe("aviso de mudança de acesso", () => {
  it.each(variantes)("$tipo: resolve placeholders, sem travessão e sem tags no texto puro", (v) => {
    const e = buildAvisoDeMudancaDeAcesso(v);
    const tudo = e.subject + e.html + e.text;
    expect(tudo).toContain("Acme");
    expect(tudo).not.toMatch(/\{[a-z]+\}/);
    expect(tudo).not.toMatch(/[—–·]/);
    expect(e.text).not.toMatch(/<[a-z/]/i);
    expect(e.text).toContain("Um administrador da empresa");
    expect(e.text).toContain("wa.me/5521977357727");
  });

  it("papel alterado diz o papel novo e o anterior", () => {
    const e = buildAvisoDeMudancaDeAcesso(papel);
    expect(e.text).toContain("de Atendente para Gerente");
  });

  it("acesso removido orienta falar com o administrador e não traz botão", () => {
    const e = buildAvisoDeMudancaDeAcesso(removido);
    expect(e.text).toContain("Se foi engano, fale com o administrador da empresa.");
    expect(e.html).not.toContain("Abrir o ");
  });

  it("escapa o nome da empresa no HTML", () => {
    const e = buildAvisoDeMudancaDeAcesso({ ...removido, empresa: "<script>x</script>" });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
  });

  it("segue o idioma de quem recebe", () => {
    const e = buildAvisoDeMudancaDeAcesso({ ...reativado, idioma: "es" });
    expect(e.subject).toBe("Tu acceso a Acme fue reactivado");
  });
});
