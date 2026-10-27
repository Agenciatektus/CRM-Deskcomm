import { describe, expect, it, vi } from "vitest";

import { bancoFalso, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { vendaDiretaLigada } from "./venda-direta";

const com = (r: Resposta) => bancoFalso(() => r).cliente as never;

describe("vendaDiretaLigada", () => {
  it("só o valor exato 'ligado' liga", async () => {
    expect(await vendaDiretaLigada(com({ data: { valor: "ligado" } }))).toBe(true);
  });

  it.each([["desligado"], ["false"], ["true"], ["LIGADO"], [" ligado"], [""], [null]])("valor %j = desligada", async (valor) => {
    expect(await vendaDiretaLigada(com({ data: { valor } }))).toBe(false);
  });

  it("linha ausente = desligada", async () => {
    expect(await vendaDiretaLigada(com({ data: null }))).toBe(false);
  });

  it("erro do banco = desligada (falha fechada)", async () => {
    expect(await vendaDiretaLigada(com({ error: { code: "42P01", message: "x" } }))).toBe(false);
  });

  it("leitura que lança = desligada", async () => {
    const quebrado = { from: () => { throw new Error("boom"); } } as never;
    expect(await vendaDiretaLigada(quebrado)).toBe(false);
  });

  it("lê a chave VENDA_DIRETA de platform_config", async () => {
    const b = bancoFalso(() => ({ data: { valor: "ligado" } }));
    await vendaDiretaLigada(b.cliente as never);
    expect(b.cadeias[0]?.tabela).toBe("platform_config");
    expect(b.cadeias[0]?.passos.find((p) => p.metodo === "eq")?.args).toEqual(["chave", "VENDA_DIRETA"]);
  });
});
