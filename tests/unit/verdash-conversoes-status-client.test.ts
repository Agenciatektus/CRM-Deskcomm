import { afterEach, describe, expect, it, vi } from "vitest";

import { verdashConversoesStatus } from "@/lib/channels/verdash/client";

const creds = { instanceName: "i", token: "TOKEN-SECRETO", vinculoId: "v1", baseUrl: "https://x" };

afterEach(() => vi.unstubAllGlobals());

function stub(resposta: unknown, status = 200) {
  const f = vi.fn(async () => new Response(JSON.stringify(resposta), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("verdashConversoesStatus", () => {
  it("POST em crm-conversoes-status com x-crm-token e o corpo do aviso", async () => {
    const f = stub({ success: true, data: { ativo: true } });
    const aviso = { ativo: true as const, pixel_id: "12345", eventos: ["Purchase"] };
    expect(await verdashConversoesStatus(creds, aviso)).toEqual({ ativo: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/crm-conversoes-status$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-crm-token"]).toBe("TOKEN-SECRETO");
    expect(JSON.parse(String(init.body))).toEqual(aviso);
  });

  it("desligar manda só { ativo: false }", async () => {
    const f = stub({ success: true, data: { ativo: false } });
    await verdashConversoesStatus(creds, { ativo: false });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ ativo: false });
  });

  it("erro 401/400 lança com o vocabulário do canal, sem vazar o token", async () => {
    stub({ success: false, error: "token inválido" }, 401);
    const erro = await verdashConversoesStatus(creds, { ativo: false }).catch((e: Error) => e);
    expect((erro as Error).message).toBe("verdash_request_failed: 401 token inválido");
    expect((erro as Error).message).not.toContain("TOKEN-SECRETO");
  });

  it("rede fora: verdash_unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(verdashConversoesStatus(creds, { ativo: false })).rejects.toThrow(/^verdash_unreachable/);
  });
});
