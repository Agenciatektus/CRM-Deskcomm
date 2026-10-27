import { describe, it, expect, vi } from "vitest";
import { IaPropriaSemCredencialError, instalacaoPodeServirIa } from "./ia-propria";

const db = (fn: () => Promise<unknown>) => ({ query: fn }) as never;

describe("instalacaoPodeServirIa", () => {
  it("true quando o banco diz true", async () => {
    expect(await instalacaoPodeServirIa(db(async () => ({ rows: [{ pode: true }] })), "o")).toBe(true);
  });
  it("false quando o banco diz false", async () => {
    expect(await instalacaoPodeServirIa(db(async () => ({ rows: [{ pode: false }] })), "o")).toBe(false);
  });
  it("erro de leitura nega (fail-closed) e loga", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await instalacaoPodeServirIa(db(async () => { throw new Error("boom"); }), "o")).toBe(false);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it("sem linha nega", async () => {
    expect(await instalacaoPodeServirIa(db(async () => ({ rows: [] })), "o")).toBe(false);
  });
  it("erro tipado carrega codigo e mensagem", () => {
    const e = new IaPropriaSemCredencialError();
    expect(e.code).toBe("ia_propria_sem_credencial");
    expect(e.message).toContain("IA própria");
  });
});
