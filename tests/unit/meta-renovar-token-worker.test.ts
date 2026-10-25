/**
 * A rodada que renova o token longo da Meta antes dos 60 dias.
 * As propriedades que importam: falha preserva o token antigo, conexão manual e
 * fora da janela nem é lida, e token nunca vai a log nem a auditoria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: vi.fn(() => true) }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_a: unknown, v: string) => `ENC(${v})`),
  decryptWebhookSecret: vi.fn(async () => "TOKEN-ANTIGO"),
}));

const AMBIENTE = {
  META_ADS_OAUTH_APP_ID: "123",
  META_ADS_OAUTH_APP_SECRET: "segredo-da-app",
  NEXT_PUBLIC_APP_URL: "https://crm.exemplo",
};
const AGORA = new Date("2026-10-25T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

interface Linha {
  organization_id: string;
  access_token_encrypted: string;
  default_account_id: string | null;
  meta_user_id: string | null;
  scopes: string[] | null;
  updated_by: string | null;
  connected_via: string;
  platform: string;
  token_expires_at: string;
}

/** Dublê que aplica de verdade os filtros que a rota pede, para o teste medir a janela. */
function bancoCom(linhas: Linha[]) {
  const upserts: Record<string, unknown>[] = [];
  const filtros: ((l: Linha) => boolean)[] = [];
  const consulta = {
    select: () => consulta,
    eq: (c: keyof Linha, v: unknown) => (filtros.push((l) => l[c] === v), consulta),
    gt: (c: keyof Linha, v: string) => (filtros.push((l) => String(l[c]) > v), consulta),
    lte: (c: keyof Linha, v: string) => (filtros.push((l) => String(l[c]) <= v), consulta),
    order: () => consulta,
    limit: () => Promise.resolve({ data: linhas.filter((l) => filtros.every((f) => f(l))), error: null }),
  };
  const admin = {
    from: () => ({
      select: () => {
        filtros.length = 0;
        return consulta;
      },
      upsert: (v: Record<string, unknown>) => {
        upserts.push(v);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { admin: admin as never, upserts };
}

const linha = (sobrescreve: Partial<Linha> = {}): Linha => ({
  organization_id: "org-1",
  access_token_encrypted: "\\xAAAA",
  default_account_id: "act_1",
  meta_user_id: "u-9",
  scopes: ["ads_read"],
  updated_by: "user-1",
  connected_via: "oauth",
  platform: "meta_ads",
  token_expires_at: new Date(AGORA.getTime() + 5 * DIA).toISOString(),
  ...sobrescreve,
});

async function carregar(sobrescreve: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...AMBIENTE, ...sobrescreve })) process.env[k] = v;
  return import("@/app/api/v1/cron/meta-renovar-token/route");
}

function meta(resposta: unknown, status = 200) {
  const f = vi.fn(async () => new Response(JSON.stringify(resposta), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("renovarTokensDaMeta", () => {
  beforeEach(() => vi.mocked(audit).mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("sucesso: grava o token novo cifrado, a validade nova e mantém usuário Meta e escopos", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const f = meta({ access_token: "TOKEN-NOVO", expires_in: 5184000 });
    const { admin, upserts } = bancoCom([linha()]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ examinadas: 1, renovadas: 1, falhas: 0 });
    expect(upserts[0]).toMatchObject({
      access_token_encrypted: "ENC(TOKEN-NOVO)",
      connected_via: "oauth",
      meta_user_id: "u-9",
      scopes: ["ads_read"],
      token_expires_at: new Date(AGORA.getTime() + 5184000 * 1000).toISOString(),
    });
    const corpo = String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(corpo).toContain("grant_type=fb_exchange_token");
    expect(corpo).toContain("fb_exchange_token=TOKEN-ANTIGO");
  });

  it("falha da Meta: não grava nada (o token antigo fica) e não audita", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ error: { code: 190, type: "OAuthException", message: "TOKEN-ANTIGO expirou" } }, 400);
    const { admin, upserts } = bancoCom([linha()]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ renovadas: 0, falhas: 1 });
    expect(upserts).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("uma falha não impede a renovação das outras", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 1 } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "N2", expires_in: 100 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const { admin, upserts } = bancoCom([linha(), linha({ organization_id: "org-2" })]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ examinadas: 2, renovadas: 1, falhas: 1 });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ organization_id: "org-2" });
  });

  it("sem app OAuth: resumo semAppOAuth, sem rede, sem erro", async () => {
    const { renovarTokensDaMeta } = await carregar({ META_ADS_OAUTH_APP_ID: "", META_ADS_OAUTH_APP_SECRET: "" });
    const f = meta({});
    const { admin } = bancoCom([linha()]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toEqual({ examinadas: 0, renovadas: 0, falhas: 0, semAppOAuth: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("conexão manual, fora da janela (já renovada) e já vencida são ignoradas", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const f = meta({ access_token: "N", expires_in: 100 });
    const { admin } = bancoCom([
      linha({ connected_via: "manual" }),
      linha({ token_expires_at: new Date(AGORA.getTime() + 59 * DIA).toISOString() }),
      linha({ token_expires_at: new Date(AGORA.getTime() - DIA).toISOString() }),
    ]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r.examinadas).toBe(0);
    expect(f).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("idempotente: a segunda rodada seguida não renova de novo", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ access_token: "TOKEN-NOVO", expires_in: 5184000 });
    const linhas = [linha()];
    const { admin, upserts } = bancoCom(linhas);

    await renovarTokensDaMeta(admin, { agora: AGORA });
    linhas[0]!.token_expires_at = String(upserts[0]!.token_expires_at);
    const r2 = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r2.renovadas).toBe(0);
    expect(upserts).toHaveLength(1);
  });

  it("auditoria e logs nunca levam token nem segredo", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ access_token: "TOKEN-NOVO", expires_in: 5184000 });
    const espioes = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const { admin } = bancoCom([linha()]);

    await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(audit).toHaveBeenCalledTimes(1);
    const visto = JSON.stringify([vi.mocked(audit).mock.calls, espioes.map((e) => e.mock.calls)]);
    for (const segredo of ["TOKEN-NOVO", "TOKEN-ANTIGO", "segredo-da-app"]) expect(visto).not.toContain(segredo);
    espioes.forEach((e) => e.mockRestore());
  });
});
