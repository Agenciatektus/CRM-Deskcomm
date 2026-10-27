import { describe, expect, it } from "vitest";

import { comLargura, urlDaFotoDaOrganizacao, urlDaFotoDoUsuario } from "./foto";

const ORG = "22222222-2222-4222-8222-222222222222";
const CAMINHO = `organizacoes/${ORG}/33333333-3333-4333-8333-333333333333.webp`;

describe("URL da foto com largura", () => {
  it("sem largura, a URL é a de sempre", () => {
    expect(urlDaFotoDaOrganizacao(ORG, CAMINHO)).toBe(`/api/v1/organizacoes/${ORG}/foto?v=33333333`);
  });
  it("com largura acrescenta &w=", () => {
    expect(urlDaFotoDaOrganizacao(ORG, CAMINHO, 64)).toBe(`/api/v1/organizacoes/${ORG}/foto?v=33333333&w=64`);
  });
  it("sem caminho (sem ?v=) usa ?w=; essa URL não ganha cache imutável na rota", () => {
    expect(urlDaFotoDoUsuario(ORG, null, 64)).toBe(`/api/v1/usuarios/${ORG}/foto?w=64`);
  });
  it("sem foto continua null", () => {
    expect(urlDaFotoDaOrganizacao(ORG, null, 64)).toBeNull();
  });
  it("comLargura não mexe sem largura", () => {
    expect(comLargura("/x?v=1")).toBe("/x?v=1");
  });
});
