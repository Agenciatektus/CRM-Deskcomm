import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { IaPropriaSemCredencialError, instalacaoPodeServirIa, instalacaoPodeServirIaViaRpc, instalacaoPodeServirIaComMemo, invalidarMemoIaPropria } from "./ia-propria";

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

describe("instalacaoPodeServirIaComMemo", () => {
  beforeEach(() => invalidarMemoIaPropria());
  afterEach(() => vi.useRealTimers());
  const rpcContado = (data: unknown) => {
    const fn = vi.fn(async () => ({ data, error: null }));
    return { admin: { rpc: fn }, fn };
  };

  it("devolve o mesmo valor dentro do TTL sem nova consulta", async () => {
    const { admin, fn } = rpcContado(true);
    expect(await instalacaoPodeServirIaComMemo(admin, "o")).toBe(true);
    expect(await instalacaoPodeServirIaComMemo(admin, "o")).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("memoriza false tambem, por org", async () => {
    const { admin, fn } = rpcContado(false);
    expect(await instalacaoPodeServirIaComMemo(admin, "a")).toBe(false);
    expect(await instalacaoPodeServirIaComMemo(admin, "a")).toBe(false);
    await instalacaoPodeServirIaComMemo(admin, "b");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("expira apos 30 s", async () => {
    vi.useFakeTimers();
    const { admin, fn } = rpcContado(true);
    await instalacaoPodeServirIaComMemo(admin, "o");
    vi.advanceTimersByTime(29_000);
    await instalacaoPodeServirIaComMemo(admin, "o");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await instalacaoPodeServirIaComMemo(admin, "o");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("invalidar limpa o memo", async () => {
    const { admin, fn } = rpcContado(true);
    await instalacaoPodeServirIaComMemo(admin, "o");
    invalidarMemoIaPropria();
    await instalacaoPodeServirIaComMemo(admin, "o");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("falha de leitura nao e memoizada (fail-closed, tenta de novo)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ data: true, error: null });
    const admin = { rpc: fn };
    expect(await instalacaoPodeServirIaComMemo(admin, "o")).toBe(false);
    expect(await instalacaoPodeServirIaComMemo(admin, "o")).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});
