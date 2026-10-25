/**
 * Passkey e endurecimento da Fatia 8 contra um FZAP de mentira que devolve os
 * formatos da spec v1.35.2 (`passkey.requestOptions` no status, assertion em
 * `/session/passkey/assert`) e RECUSA o que o FZAP recusa (400 sem sessao e com
 * assertion incompleta; `/session/qr` e `/session/pairphone` dao 500 sem socket).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ buckets: new Map<string, { n: number; ate: number }>() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: async (key: string, limit: number, janelaS: number) => {
    const agora = Date.now();
    const b = h.buckets.get(key);
    if (!b || b.ate <= agora) {
      h.buckets.set(key, { n: 1, ate: agora + janelaS * 1000 });
      return { allowed: true };
    }
    b.n += 1;
    return { allowed: b.n <= limit };
  },
}));
vi.mock("./credentials", () => ({
  resolveVerdashCreds: vi.fn(async () => ({
    instanceName: "inst",
    token: "TOKEN-SECRETO",
    vinculoId: null,
    baseUrl: "https://fzap.test",
  })),
}));
vi.mock("./estado-nativo", () => ({ marcarJaConectou: vi.fn(async () => true) }));
vi.mock("./telefone-nativo", () => ({ preencherTelefoneNativo: vi.fn(async () => "preenchido") }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { codigoPorNumero, estadoDaConexaoNativa } from "./conexao-nativa";
import { ASSERTION_MAX_BYTES, lerAssertion, lerPasskeyDoStatus } from "./passkey-forma";
import { enviarPasskey } from "./passkey-nativo";
import { qrDoCanalNativo } from "./qr-nativo";

const QR = "data:image/png;base64,iVBORw0KGgo=";
const OPCOES = { challenge: "q1xAbCdEfGhIjKlMnOp==", rpId: "whatsapp.com", allowCredentials: [], userVerification: "required" };
const ASSERT = {
  id: "AQIDBA",
  rawId: "AQIDBA",
  type: "public-key",
  response: { clientDataJSON: "eyJ0eXBlIjoi", authenticatorData: "SZYN5Y", signature: "MEUCIQ", userHandle: "NTU1MTk4" },
};
const fzap = {
  connected: false,
  loggedIn: false,
  passkey: undefined as unknown,
  calls: [] as string[],
  asserts: [] as unknown[],
};

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

function fzapFalso(url: string, init?: RequestInit): Response {
  const path = new URL(url).pathname;
  fzap.calls.push(`${init?.method ?? "GET"} ${path}`);
  if (path === "/session/status") {
    const base = { connected: fzap.connected, loggedIn: fzap.loggedIn, jid: "" };
    return resposta(200, { success: true, data: fzap.passkey === undefined ? base : { ...base, passkey: fzap.passkey } });
  }
  if (path === "/session/connect") {
    fzap.connected = true;
    return resposta(200, { success: true, data: { connected: true, loggedIn: false } });
  }
  if (path === "/session/qr") {
    if (!fzap.connected) return resposta(500, { success: false, error: "no session" });
    return resposta(200, { success: true, data: { qrCode: QR } });
  }
  if (path === "/session/pairphone") {
    if (!fzap.connected) return resposta(500, { success: false, error: "not initialized" });
    return resposta(200, { success: true, data: { LinkingCode: "9H3J-H3J8" } });
  }
  if (path === "/session/passkey/assert") {
    if (!fzap.connected) return resposta(400, { code: 400, success: false, error: "no whatsmeow session connected" });
    const a = JSON.parse(String(init?.body)) as { rawId?: string; response?: { clientDataJSON?: string; signature?: string } };
    if (!a.rawId || !a.response?.clientDataJSON || !a.response?.signature) {
      return resposta(400, { code: 400, success: false, error: "incomplete WebAuthn assertion" });
    }
    fzap.asserts.push(a);
    return resposta(200, { code: 200, success: true, data: { success: true } });
  }
  return resposta(404, {});
}

function admin(row: Record<string, unknown> | null) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: row, error: null });
  return { from: () => q } as never;
}
const NATIVA = {
  provider: "verdash",
  verdash_origem: "nativa",
  verdash_instance_name: "inst",
  status: "STARTING",
  phone_number: null,
  archived_at: null,
};
const adminOk = (o: Record<string, unknown> = {}) => admin({ ...NATIVA, ...o });
const sim = async () => "u1";
let n = 0;
const canal = () => `canal-pk-${++n}`;

beforeEach(() => {
  h.buckets.clear();
  Object.assign(fzap, { connected: false, loggedIn: false, passkey: undefined, calls: [], asserts: [] });
  vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => fzapFalso(String(u), i)));
});
afterEach(() => vi.unstubAllGlobals());

describe("passkey no estado da conexao", () => {
  it("repassa SO o desafio filtrado (campo estranho some) e nao pede o QR", async () => {
    fzap.connected = true;
    fzap.passkey = { requestOptions: { ...OPCOES, extra: "lixo", token: "X" }, interno: 1 };
    const r = await estadoDaConexaoNativa(adminOk(), "org", canal(), sim);
    expect(r).toMatchObject({ status: 200, corpo: { estado: "exige_passkey", passkey: OPCOES } });
    expect(JSON.stringify(r)).not.toMatch(/lixo|interno/);
    expect(fzap.calls).not.toContain("GET /session/qr");
  });

  it("forma desconhecida falha FECHADO: erro com mensagem clara, nada repassado", async () => {
    fzap.connected = true;
    for (const ruim of ["texto", { requestOptions: { challenge: "x", rpId: "evil.com" } }, { requestOptions: "str" }]) {
      fzap.passkey = ruim;
      const r = await estadoDaConexaoNativa(adminOk(), "org", canal(), sim);
      expect(r).toMatchObject({ status: 200, corpo: { estado: "erro" } });
      expect(JSON.stringify(r)).not.toMatch(/evil/);
    }
  });

  it("controle negativo: sem passkey o QR segue normal", async () => {
    fzap.connected = true;
    expect(await estadoDaConexaoNativa(adminOk(), "org", canal(), sim)).toMatchObject({ corpo: { estado: "aguardando_leitura" } });
  });

  it("lerPasskeyDoStatus: ausente = null; rpId, uv e challenge fora do esperado = invalida", () => {
    expect(lerPasskeyDoStatus(undefined)).toBeNull();
    expect(lerPasskeyDoStatus({})).toBeNull();
    expect(lerPasskeyDoStatus({ requestOptions: { ...OPCOES, userVerification: "x" } })).toBe("invalida");
    expect(lerPasskeyDoStatus({ requestOptions: { ...OPCOES, challenge: "<script>" } })).toBe("invalida");
  });
});

describe("enviarPasskey", () => {
  it("entrega a assertion reconstruida ao FZAP", async () => {
    fzap.connected = true;
    const r = await enviarPasskey(adminOk(), "org", canal(), { ...ASSERT, extra: "lixo" }, sim);
    expect(r).toMatchObject({ status: 200, corpo: { ok: true } });
    expect(fzap.asserts).toEqual([ASSERT]);
  });

  it("assertion com corpo grande, incompleta ou de forma errada = 400 sem chamar o FZAP", async () => {
    fzap.connected = true;
    const grande = { ...ASSERT, response: { ...ASSERT.response, clientDataJSON: "A".repeat(ASSERTION_MAX_BYTES) } };
    for (const ruim of [grande, { ...ASSERT, rawId: undefined }, { rawId: "x" }, "txt", null, { ...ASSERT, type: "password" }]) {
      expect(await enviarPasskey(adminOk(), "org", canal(), ruim, sim)).toMatchObject({ status: 400, estado: "invalid-assertion" });
    }
    expect(fzap.calls).toEqual([]);
    expect(lerAssertion(ASSERT)).toEqual(ASSERT);
  });

  it("FZAP recusa (sem sessao): 502 com mensagem fixa, sem corpo do FZAP nem assertion", async () => {
    const r = await enviarPasskey(adminOk(), "org", canal(), ASSERT, sim);
    expect(r).toMatchObject({ status: 502, estado: "upstream-failed" });
    expect(JSON.stringify(r)).not.toMatch(/whatsmeow|MEUCIQ/);
  });

  it("ja conectado = 409; outra org = null; nao admin = 403; balde de 6 por minuto = 429", async () => {
    fzap.connected = fzap.loggedIn = true;
    expect(await enviarPasskey(adminOk(), "org", canal(), ASSERT, sim)).toMatchObject({ status: 409 });
    expect(await enviarPasskey(admin(null), "x", canal(), ASSERT, sim)).toBeNull();
    expect(await enviarPasskey(adminOk(), "org", canal(), ASSERT, async () => null)).toMatchObject({ status: 403 });
    fzap.loggedIn = false;
    const c = canal();
    for (let i = 0; i < 6; i++) await enviarPasskey(adminOk(), "org", c, ASSERT, sim);
    expect(await enviarPasskey(adminOk(), "org", c, ASSERT, sim)).toMatchObject({ status: 429, retryAfter: 15 });
  });
});

describe("endurecimento da Fatia 7", () => {
  it("portao de estado: conexao, codigo, passkey e /qr recusam o mesmo que a /qr", async () => {
    fzap.connected = true;
    for (const status of ["WORKING", "STOPPED", "PAUSED"]) {
      const a = adminOk({ status });
      expect(await estadoDaConexaoNativa(a, "org", canal(), sim)).toMatchObject({ status: 409 });
      expect(await codigoPorNumero(a, "org", canal(), "11912345678", sim)).toMatchObject({ status: 409 });
      expect(await enviarPasskey(a, "org", canal(), ASSERT, sim)).toMatchObject({ status: 409 });
      expect(await qrDoCanalNativo(a, "org", canal(), sim)).toMatchObject({ status: 409 });
    }
    expect(fzap.calls).toEqual([]);
    for (const status of ["STARTING", "SCAN_QR_CODE", "FAILED"]) {
      expect(await estadoDaConexaoNativa(adminOk({ status }), "org", canal(), sim)).toMatchObject({ status: 200 });
    }
  });

  it("codigo por numero com o connect no throttle de 15 s = 429 Retry-After 15, sem pairphone", async () => {
    const a = adminOk();
    const c = canal();
    await estadoDaConexaoNativa(a, "org", c, sim, { esperaMs: 0 }); // gasta o connect da janela
    fzap.connected = false; // caiu de novo dentro dos 15 s
    fzap.calls.length = 0;
    const r = await codigoPorNumero(a, "org", c, "11912345678", sim, { esperaMs: 0 });
    expect(r).toMatchObject({ status: 429, estado: "rate-limited", retryAfter: 15 });
    expect(fzap.calls).not.toContain("POST /session/pairphone");
  });

  it("balde agregado do CANAL: usuarios diferentes somam 150 por minuto", async () => {
    fzap.connected = true;
    const c = canal();
    const a = adminOk();
    for (let i = 0; i < 150; i++) {
      expect(await estadoDaConexaoNativa(a, "org", c, async () => `u${i % 3}`)).toMatchObject({ status: 200 });
    }
    expect(await estadoDaConexaoNativa(a, "org", c, async () => "u9")).toMatchObject({ status: 429, retryAfter: 15 });
  });
});
