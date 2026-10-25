import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ contas: vi.fn() }));
vi.mock("@/lib/plataformas-de-anuncio/meta/insights", () => ({ listarContas: mock.contas }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({
  configuracaoDoMetaAds: () => ({ appId: "111", appSecret: "segredo", redirectUri: "x" }),
}));

import { validarTokenColado } from "@/lib/plataformas-de-anuncio/meta/validar-token-colado";

const TOKEN = "EAAtokensecretoquenuncadevesair1234567890";
const debug = (data: Record<string, unknown>) =>
  vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 }));
const bom = { is_valid: true, type: "USER", scopes: ["ads_read", "email"], expires_at: 0, app_id: "999" };

beforeEach(() => mock.contas.mockResolvedValue({ ok: true, dados: [{ id: "act_1" }] }));
afterEach(() => vi.unstubAllGlobals());

describe("validarTokenColado", () => {
  it("aceita usuário com ads_read e contas; expires_at 0 = nunca expira", async () => {
    vi.stubGlobal("fetch", debug(bom));
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: true, expiraEm: null, appId: "999", contas: ["act_1"] });
  });

  it("usa a data real quando o token expira", async () => {
    vi.stubGlobal("fetch", debug({ ...bom, expires_at: 1795000000 }));
    const r = await validarTokenColado(TOKEN);
    expect(r).toMatchObject({ ok: true, expiraEm: new Date(1795000000 * 1000).toISOString() });
  });

  it("recusa is_valid=false", async () => {
    vi.stubGlobal("fetch", debug({ ...bom, is_valid: false }));
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: false, motivo: "token_invalido" });
  });

  it("recusa token de Página", async () => {
    vi.stubGlobal("fetch", debug({ ...bom, type: "PAGE" }));
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: false, motivo: "token_de_pagina" });
  });

  it("recusa sem ads_read", async () => {
    vi.stubGlobal("fetch", debug({ ...bom, scopes: ["email"] }));
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: false, motivo: "sem_ads_read" });
  });

  it("recusa token sem nenhuma conta", async () => {
    vi.stubGlobal("fetch", debug(bom));
    mock.contas.mockResolvedValue({ ok: true, dados: [] });
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: false, motivo: "sem_contas" });
  });

  it("rede ou Graph fora = validacao_indisponivel, sem eco do token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`falhou ${TOKEN}`);
      }),
    );
    const r = await validarTokenColado(TOKEN);
    expect(r).toEqual({ ok: false, motivo: "validacao_indisponivel" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: false, motivo: "validacao_indisponivel" });
  });

  it("token de outro app (400 code 100): refaz com o próprio token e aceita", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: bom }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await validarTokenColado(TOKEN)).toMatchObject({ ok: true });
    expect(String(f.mock.calls[1]![0])).toContain(`access_token=${TOKEN}`);
  });

  it("token de outro app que também falha sozinho: token_invalido", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 }));
    vi.stubGlobal("fetch", f);
    expect(await validarTokenColado(TOKEN)).toEqual({ ok: false, motivo: "token_invalido" });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
