import { describe, it, expect, vi } from "vitest";
import { IaPropriaSemCredencialError, instalacaoPodeServirIa, instalacaoPodeServirIaViaRpc } from "./ia-propria";

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

describe("instalacaoPodeServirIaViaRpc", () => {
  const rpc = (r: () => Promise<unknown>) => ({ rpc: r });
  it("true so quando data === true", async () => {
    expect(await instalacaoPodeServirIaViaRpc(rpc(async () => ({ data: true, error: null })), "o")).toBe(true);
    expect(await instalacaoPodeServirIaViaRpc(rpc(async () => ({ data: false, error: null })), "o")).toBe(false);
    expect(await instalacaoPodeServirIaViaRpc(rpc(async () => ({ data: null, error: null })), "o")).toBe(false);
  });
  it("erro ou throw nega (fail-closed)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await instalacaoPodeServirIaViaRpc(rpc(async () => ({ data: true, error: { message: "x" } })), "o")).toBe(false);
    expect(await instalacaoPodeServirIaViaRpc(rpc(async () => { throw new Error("boom"); }), "o")).toBe(false);
    log.mockRestore();
  });
});
