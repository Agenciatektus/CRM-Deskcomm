/**
 * A conexao por QR/codigo do canal nativo contra um FZAP de mentira que devolve os
 * formatos MEDIDOS (`{data:{qrCode}}`, `{data:{connected,loggedIn,jid}}`) e RECUSA o
 * que o FZAP recusa: `/session/qr` e `/session/pairphone` dao 500 com a sessao caida.
 * Caso real de 25/10/2026: a WhatsApp encerra a sessao ~3 min sem leitura.
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

import {
  estadoDaConexaoNativa,
  codigoPorNumero,
  formatarCodigo,
  normalizarTelefone,
} from "./conexao-nativa";
import { qrDoCanalNativo } from "./qr-nativo";

const QR = "data:image/png;base64,iVBORw0KGgo=";
const fzap = {
  connected: false,
  loggedIn: false,
  conectouEm: 0,
  conexoes: 0,
  pair: "9H3J-H3J8" as unknown,
  qrApos: 0,
  calls: [] as string[],
};

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status });
}

function fzapFalso(url: string, init?: RequestInit): Response {
  const path = new URL(url).pathname;
  fzap.calls.push(`${init?.method ?? "GET"} ${path}`);
  if (path === "/session/status") {
    const jid = fzap.loggedIn ? "5511912345678:1@s.whatsapp.net" : "";
    return resposta(200, { success: true, data: { connected: fzap.connected, loggedIn: fzap.loggedIn, jid } });
  }
  if (path === "/session/connect") {
    fzap.connected = true;
    fzap.conectouEm = Date.now();
    fzap.conexoes += 1;
    return resposta(200, { success: true, data: { connected: true, loggedIn: false } });
  }
  if (path === "/session/qr") {
    if (!fzap.connected) return resposta(500, { success: false, error: "no session" });
    const pronto = Date.now() - fzap.conectouEm >= fzap.qrApos;
    return resposta(200, { success: true, data: { qrCode: pronto ? QR : "" } });
  }
  if (path === "/session/pairphone") {
    if (!fzap.connected) return resposta(500, { success: false, error: "not initialized" });
    return resposta(200, { success: true, data: { LinkingCode: fzap.pair } });
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
const canal = () => `canal-${++n}`;

beforeEach(() => {
  h.buckets.clear();
  Object.assign(fzap, { connected: false, loggedIn: false, conexoes: 0, pair: "9H3J-H3J8", qrApos: 0, calls: [] });
  vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => fzapFalso(String(u), i)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("estadoDaConexaoNativa", () => {
  it("sessao caida pelo timeout: reconecta UMA vez por janela de 15 s e devolve o QR", async () => {
    const c = canal();
    const a = adminOk();
    const r1 = await estadoDaConexaoNativa(a, "org", c, sim, { esperaMs: 0 });
    expect(r1).toMatchObject({ status: 200, corpo: { estado: "aguardando_leitura", qr: QR } });
    expect(fzap.conexoes).toBe(1);
    fzap.connected = false; // caiu de novo dentro da janela
    const r2 = await estadoDaConexaoNativa(a, "org", c, sim, { esperaMs: 0 });
    expect(r2).toMatchObject({ status: 200, corpo: { estado: "reconectando" } });
    expect(fzap.conexoes).toBe(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16_000);
    await estadoDaConexaoNativa(a, "org", c, sim, { esperaMs: 0 });
    expect(fzap.conexoes).toBe(2);
  });

  it("sessao aberta sem login nao chama connect; QR ainda nao nascido = gerando", async () => {
    fzap.connected = true;
    fzap.qrApos = 10_000;
    const r = await estadoDaConexaoNativa(adminOk(), "org", canal(), sim);
    expect(r).toMatchObject({ status: 200, corpo: { estado: "gerando" } });
    expect(fzap.conexoes).toBe(0);
  });

  it("conectado e logado devolve o telefone da linha e nao abre sessao", async () => {
    fzap.connected = true;
    fzap.loggedIn = true;
    const r = await estadoDaConexaoNativa(adminOk({ phone_number: "5511912345678" }), "org", canal(), sim);
    expect(r).toMatchObject({ status: 200, corpo: { estado: "conectado", telefone: "5511912345678" } });
    expect(fzap.conexoes).toBe(0);
  });

  it("a leitura NAO e limitada pelo balde do connect (poll de 2,5 s): 60 por minuto", async () => {
    fzap.connected = true;
    const c = canal();
    for (let i = 0; i < 60; i++) {
      expect(await estadoDaConexaoNativa(adminOk(), "org", c, sim)).toMatchObject({ status: 200 });
    }
    expect(await estadoDaConexaoNativa(adminOk(), "org", c, sim)).toMatchObject({ status: 429 });
  });

  it("falha do FZAP vira erro com mensagem fixa, sem token nem corpo dele", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(500, { success: false, error: "proxy http://u:senha@x" })));
    const r = await estadoDaConexaoNativa(adminOk(), "org", canal(), sim);
    expect(r).toMatchObject({ status: 200, corpo: { estado: "erro", mensagem: "Não foi possível gerar o QR agora." } });
    expect(JSON.stringify(r)).not.toMatch(/senha|TOKEN-SECRETO/);
  });

  it("outra org / nao nativa = null (404); nao admin = 403; arquivada = 409", async () => {
    expect(await estadoDaConexaoNativa(admin(null), "outra-org", canal(), sim)).toBeNull();
    expect(await estadoDaConexaoNativa(adminOk({ verdash_origem: "vinculada" }), "org", canal(), sim)).toBeNull();
    expect(await estadoDaConexaoNativa(adminOk(), "org", canal(), async () => null)).toMatchObject({ status: 403 });
    expect(await estadoDaConexaoNativa(adminOk({ archived_at: "2026-10-01" }), "org", canal(), sim)).toMatchObject({
      status: 409,
      estado: "archived",
    });
    expect(fzap.calls).toEqual([]);
  });
});

describe("codigoPorNumero", () => {
  it("telefone invalido = 400 sem chamar o FZAP nem gastar o balde de 30 s", async () => {
    const c = canal();
    expect(await codigoPorNumero(adminOk(), "org", c, "123", sim)).toMatchObject({ status: 400 });
    expect(fzap.calls).toEqual([]);
    const ok = await codigoPorNumero(adminOk(), "org", c, "(11) 91234-5678", sim, { esperaMs: 0 });
    expect(ok).toMatchObject({ status: 200, corpo: { codigo: "9H3J-H3J8" } });
  });

  it("garante o connect, manda DDI 55 e limita a 1 pedido a cada 30 s", async () => {
    const c = canal();
    await codigoPorNumero(adminOk(), "org", c, "11912345678", sim, { esperaMs: 0 });
    expect(fzap.conexoes).toBe(1);
    const chamada = vi.mocked(fetch).mock.calls.find((x) => String(x[0]).endsWith("pairphone"))!;
    expect(JSON.parse(String((chamada[1] as RequestInit).body))).toEqual({ phone: "5511912345678" });
    expect(await codigoPorNumero(adminOk(), "org", c, "11912345678", sim, { esperaMs: 0 })).toMatchObject({
      status: 429,
      retryAfter: 30,
    });
  });

  it("formato do codigo desconhecido falha FECHADO", async () => {
    fzap.pair = { outra: "forma" };
    const r = await codigoPorNumero(adminOk(), "org", canal(), "11912345678", sim, { esperaMs: 0 });
    expect(r).toMatchObject({ status: 502, estado: "code-invalid" });
  });

  it("ja conectado = 409; outra org = null; nao admin = 403", async () => {
    fzap.connected = fzap.loggedIn = true;
    expect(await codigoPorNumero(adminOk(), "org", canal(), "11912345678", sim)).toMatchObject({ status: 409 });
    expect(await codigoPorNumero(admin(null), "x", canal(), "11912345678", sim)).toBeNull();
    expect(await codigoPorNumero(adminOk(), "org", canal(), "11912345678", async () => null)).toMatchObject({
      status: 403,
    });
  });

  it("normaliza telefone e codigo", () => {
    expect(normalizarTelefone("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizarTelefone("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizarTelefone("abc")).toBeNull();
    expect(formatarCodigo("abcd1234")).toBe("ABCD-1234");
    expect(formatarCodigo("ABCD-12")).toBeNull();
  });
});

describe("rota antiga /qr (qrDoCanalNativo) com a sessao caida", () => {
  it("reabre, espera o QR nascer (assincrono, 1,5 s) e devolve a imagem; antes dava 404 para sempre", async () => {
    vi.useFakeTimers();
    fzap.qrApos = 1500;
    const p = qrDoCanalNativo(adminOk({ status: "FAILED" }), "org", canal(), sim);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await p).toMatchObject({ status: 200 });
    expect(fzap.conexoes).toBe(1);
  });
});
