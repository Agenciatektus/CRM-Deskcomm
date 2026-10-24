import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * FATIA 3 do FZAP nativo: rota "modo qr", rota de QR e saude da conexao nativa.
 * O duble do FZAP grava header e corpo de cada chamada (testa a LIGACAO), e o
 * banco de mentira recusa chave primaria repetida como o Postgres.
 */
const ORG = "00000000-0000-4000-8000-0000000000a1";
const OUTRA = "00000000-0000-4000-8000-0000000000b2";
const PASTA_TOKEN = "token-da-pasta";
const PROXY = "http://proxy-br.segredo:3128";
const hex = (s: string) => Buffer.from(s).toString("hex");

type Row = Record<string, unknown>;
let tabela: Row[];
let comPasta: boolean;
let quemEh: { orgId: string };

function builder() {
  const eqs: [string, unknown][] = [];
  const nulls: string[] = [];
  let acao: "select" | "update" | "delete" = "select";
  let patch: Row = {};
  const achar = () =>
    tabela.filter((r) => eqs.every(([c, v]) => r[c] === v) && nulls.every((c) => r[c] == null));
  const run = () => {
    for (const r of achar()) {
      if (acao === "update") Object.assign(r, patch);
      if (acao === "delete") tabela.splice(tabela.indexOf(r), 1);
    }
    return { error: null };
  };
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
    is: (c: string) => (nulls.push(c), b),
    update: (p: Row) => ((acao = "update"), (patch = p), b),
    delete: () => ((acao = "delete"), b),
    maybeSingle: async () => ({ data: achar()[0] ?? null, error: null }),
    insert: async (row: Row) => {
      if (tabela.some((r) => r.id === row.id)) return { error: { code: "23505", message: "dup" } };
      tabela.push({ ...row });
      return { error: null };
    },
    then: (res: (v: unknown) => void) => res(run()),
  };
  return b;
}

function adminFalso() {
  return {
    from: (tab: string) => {
      if (tab === "verdash_fzap_pastas") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: comPasta
                  ? {
                      organization_id: ORG,
                      fzap_folder_id: "pasta-1",
                      folder_token_encrypted: `\\x${hex(PASTA_TOKEN)}`,
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return builder();
    },
    rpc: async (fn: string, a: Record<string, string>) =>
      fn === "fn_encrypt_oauth"
        ? { data: `\\x${hex(a.plaintext!)}`, error: null }
        : { data: Buffer.from(a.ciphertext!.replace("\\x", ""), "hex").toString(), error: null },
  } as never;
}

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn(), orgAtivaDaApi: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminFalso()) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => adminFalso()) }));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(async () => ({ id: "u" })) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com" } }));

import { requireRole, orgAtivaDaApi } from "@/lib/auth/require-role";
import { POST } from "@/app/api/v1/channels/hosted/route";
import { GET as GET_QR } from "@/app/api/v1/channel-sessions/[id]/qr/route";
import { verdashAdapter } from "@/lib/channels/adapters/verdash";

interface Chamada {
  method: string;
  path: string;
  token?: string;
  body?: Record<string, unknown>;
}
let chamadas: Chamada[];
let fzapSessao: { connected: boolean; loggedIn: boolean };
let falhaConnect: boolean;
let seq: number;
let instancias: { id: string; name: string; token: string; metadata: Record<string, unknown> }[];

const env = (s: number, data?: unknown, error?: string) => ({
  ok: s < 300,
  status: s,
  statusText: error ?? "",
  json: async () => ({ code: s, success: s < 300, data, error }),
});
const fzapDuble = (async (url: unknown, init?: RequestInit) => {
  const path = new URL(String(url)).pathname;
  const method = init?.method ?? "GET";
  const token = (init?.headers as Record<string, string> | undefined)?.token;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  chamadas.push({ method, path, token, body });
  if (token === PASTA_TOKEN) {
    if (path === "/folder/instances" && method === "POST") {
      const i = { id: `fz-${++seq}`, name: body.name, token: body.token, metadata: body.metadata };
      instancias.push(i);
      return env(201, { id: i.id });
    }
    if (path === "/folder/instances") {
      return env(200, instancias.map(({ token: _t, ...r }) => r));
    }
    const m = path.match(/^\/folder\/instances\/([^/]+)\/full$/);
    if (m && method === "DELETE") {
      instancias = instancias.filter((i) => i.id !== m[1]);
      return env(200, {});
    }
    return env(404);
  }
  if (!instancias.some((i) => i.token === token)) return env(401, undefined, "unauthorized");
  if (path === "/session/proxy/test") return env(200, {});
  if (path === "/webhook") return env(200, method === "GET" ? [] : {});
  if (path === "/session/connect") return falhaConnect ? env(500, undefined, "boom") : env(200, {});
  if (path === "/session/history-settings") return env(404, undefined, "not found");
  if (path === "/session/qr") return env(200, { qrCode: "data:image/png;base64,iVBORw0KGgo=" });
  if (path === "/session/status") return env(200, fzapSessao);
  return env(404);
}) as unknown as typeof fetch;

const fetchOriginal = globalThis.fetch;
beforeEach(() => {
  tabela = [];
  chamadas = [];
  instancias = [];
  seq = 0;
  comPasta = true;
  falhaConnect = false;
  fzapSessao = { connected: true, loggedIn: false };
  quemEh = { orgId: ORG };
  process.env.FZAP_PROXY_URL_BR = PROXY;
  process.env.VERDASH_API_BASE_URL = "http://fzap.interno:8081";
  globalThis.fetch = fzapDuble;
  vi.mocked(requireRole).mockImplementation((async () => ({
    ok: true,
    user: { id: "u", idioma: "pt-BR" },
    org: { orgId: quemEh.orgId, name: "Acme Ltda" },
  })) as never);
  vi.mocked(orgAtivaDaApi).mockImplementation(
    (async () => ({ ok: true, org: { orgId: quemEh.orgId } })) as never,
  );
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

const KEY = "11111111-1111-4111-8111-111111111111";
const post = (corpo: unknown, key: string | null = KEY) =>
  POST(
    new NextRequest("https://crm.exemplo.com/api/v1/channels/hosted", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: key ? { "Idempotency-Key": key } : {},
    }),
  );

describe("POST modo qr", () => {
  it("org sem pasta: 403 e nada criado", async () => {
    comPasta = false;
    const r = await post({ modo: "qr", rotulo: "Comercial" });
    expect(r.status).toBe(403);
    expect(chamadas).toHaveLength(0);
    expect(tabela).toHaveLength(0);
  });

  it("sem chave de idempotencia: 422", async () => {
    expect((await post({ modo: "qr", rotulo: "X" }, null)).status).toBe(422);
  });

  it("org com pasta: cria, liga a volta com o token DA INSTANCIA, conecta e grava nativa/STARTING", async () => {
    const r = await post({ modo: "qr", rotulo: "Comercial", organization_id: OUTRA });
    expect(r.status).toBe(201);
    const j = (await r.json()).data;
    expect(j.status).toBe("STARTING");
    expect(j.recebimento_ligado).toBe(true);
    const inst = instancias[0]!;
    // A org do corpo e ignorada: a instancia nasce com a org da sessao.
    expect(inst.metadata).toMatchObject({ organization_id: ORG, channel_session_id: j.channel_session_id });
    const wh = chamadas.find((c) => c.method === "POST" && c.path === "/webhook")!;
    expect(wh.token).toBe(inst.token);
    expect((wh.body!.headers as Record<string, string>)["X-Webhook-Secret"]).toMatch(/^[0-9a-f]{64}$/);
    expect(String(wh.body!.url)).toMatch(
      /^https:\/\/crm\.exemplo\.com\/api\/v1\/webhooks\/channel\/[0-9a-f]{32}$/,
    );
    expect(chamadas.find((c) => c.path === "/session/connect")!.token).toBe(inst.token);
    const hist = chamadas.find((c) => c.path === "/session/history-settings")!;
    expect(hist.method).toBe("PUT");
    expect(hist.token).toBe(inst.token);
    expect(hist.body).toEqual({ enabled: false, contacts: false, groups: false, retentionDays: 7 });
    expect(tabela).toHaveLength(1);
    expect(tabela[0]).toMatchObject({
      organization_id: ORG,
      provider: "verdash",
      verdash_origem: "nativa",
      status: "STARTING",
      display_name: "Comercial",
      verdash_instance_name: inst.name,
      archived_at: null,
    });
    expect(tabela[0]!.metadata).toMatchObject({ fzap_user_id: inst.id });
  });

  it("duplo clique com a mesma chave: UMA instancia, o segundo pedido devolve o mesmo canal", async () => {
    const a = await post({ modo: "qr", rotulo: "Comercial" });
    const b = await post({ modo: "qr", rotulo: "Comercial" });
    expect(b.status).toBe(200);
    expect((await b.json()).data.channel_session_id).toBe((await a.json()).data.channel_session_id);
    expect(instancias).toHaveLength(1);
    expect(tabela).toHaveLength(1);
  });

  it("duas chaves = dois numeros na mesma org (regressao do 25/09)", async () => {
    await post({ modo: "qr", rotulo: "A" }, KEY);
    await post({ modo: "qr", rotulo: "B" }, "22222222-2222-4222-8222-222222222222");
    expect(instancias).toHaveLength(2);
    expect(tabela).toHaveLength(2);
  });

  it("falha depois de criar (connect 500): apaga a instancia e a linha, 502", async () => {
    falhaConnect = true;
    const r = await post({ modo: "qr", rotulo: "Comercial" });
    expect(r.status).toBe(502);
    expect(instancias).toHaveLength(0);
    expect(tabela).toHaveLength(0);
    expect(chamadas.some((c) => c.method === "DELETE" && c.token === PASTA_TOKEN)).toBe(true);
  });
});

describe("GET qr", () => {
  const CANAL = "33333333-3333-4333-8333-333333333333";
  const linha = (over: Row = {}) => ({
    id: CANAL,
    organization_id: ORG,
    provider: "verdash",
    verdash_origem: "nativa",
    waha_session_name: null,
    archived_at: null,
    verdash_instance_name: "crm-x-1",
    verdash_token_encrypted: `\\x${hex("tok-inst")}`,
    verdash_vinculo_id: null,
    ...over,
  });
  const pedir = (id = CANAL) => GET_QR(new Request("http://x"), { params: Promise.resolve({ id }) });
  beforeEach(() => {
    instancias.push({ id: "fz-9", name: "crm-x-1", token: "tok-inst", metadata: {} });
  });

  it("devolve a imagem PNG decodificada, lendo com o token da instancia", async () => {
    tabela.push(linha());
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await r.arrayBuffer()).toString("base64")).toBe("iVBORw0KGgo=");
    expect(chamadas.find((c) => c.path === "/session/connect")!.token).toBe("tok-inst");
    expect(chamadas.find((c) => c.path === "/session/qr")!.token).toBe("tok-inst");
  });

  it("canal de outra org: 404; arquivado: 409", async () => {
    tabela.push(linha({ organization_id: OUTRA }));
    expect((await pedir()).status).toBe(404);
    tabela.length = 0;
    tabela.push(linha({ archived_at: "2026-10-01" }));
    expect((await pedir()).status).toBe(409);
  });

  it("ja logado: 409 sem pedir QR", async () => {
    fzapSessao = { connected: true, loggedIn: true };
    tabela.push(linha());
    expect((await pedir()).status).toBe(409);
    expect(chamadas.some((c) => c.path === "/session/qr")).toBe(false);
  });

  it("rate limit: 6 pedidos por minuto, o 7o leva 429 com Retry-After", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    tabela.push(linha({ id }));
    for (let n = 0; n < 6; n++) expect((await pedir(id)).status).toBe(200);
    const r = await pedir(id);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("15");
  });
});

describe("checkHealth nativa vs vinculada", () => {
  const sessao = (origem: string) => {
    tabela.push({
      id: "c1",
      organization_id: ORG,
      provider: "verdash",
      verdash_origem: origem,
      archived_at: null,
      verdash_instance_name: "crm-x-1",
      verdash_token_encrypted: `\\x${hex("tok-inst")}`,
      verdash_vinculo_id: null,
    });
    instancias.push({ id: "fz-9", name: "crm-x-1", token: "tok-inst", metadata: {} });
  };
  const saude = () => verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: "crm-x-1" });

  it("nativa: conectado sem login = SCAN_QR_CODE; logado = WORKING; desconectado = STARTING", async () => {
    sessao("nativa");
    fzapSessao = { connected: true, loggedIn: false };
    expect(await saude()).toMatchObject({ reachable: true, status: "SCAN_QR_CODE" });
    fzapSessao = { connected: true, loggedIn: true };
    expect(await saude()).toMatchObject({ status: "WORKING" });
    fzapSessao = { connected: false, loggedIn: false };
    expect(await saude()).toMatchObject({ status: "STARTING" });
  });

  it("REGRESSAO vinculada: loggedIn false continua FAILED", async () => {
    sessao("vinculada");
    fzapSessao = { connected: true, loggedIn: false };
    expect(await saude()).toMatchObject({ status: "FAILED", detail: "whatsapp_deslogado_na_verdash" });
  });
});
