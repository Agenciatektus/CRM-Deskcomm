/**
 * "Conectar com Meta": as duas rotas. O connect só abre para admin e só com a
 * instalação configurada; o callback confere state e navegador, queima o nonce
 * antes de trocar o código, grava cifrado (upsert por organização + plataforma)
 * e audita.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = randomUUID();
const USER = randomUUID();
const CALLBACK = "/api/v1/plataformas-de-anuncio/meta/callback";

const fake = vi.hoisted(() => ({
  env: {
    INTERNAL_SECRET: "um-segredo-de-instalacao-bem-comprido",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
  configurado: true,
  admin: true,
  suporteLibera: true,
  cifraOk: true,
  nonces: new Set<string>(),
  trocas: 0,
  troca: { ok: true } as Record<string, unknown>,
  upserts: [] as Array<{ tabela: string; valores: Record<string, unknown>; opcoes: unknown }>,
  erroDoUpsert: null as { message: string } | null,
  audits: [] as Array<Record<string, unknown>>,
  logs: [] as string[],
}));

vi.mock("@/lib/env", () => ({ env: fake.env }));
vi.mock("@/lib/audit", () => ({
  audit: async (e: Record<string, unknown>) => void fake.audits.push(e),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (m: string, c?: unknown) => fake.logs.push(m + JSON.stringify(c ?? {})),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: async () => null,
  authenticatedSessionId: async () => "sessao1",
  supportCallbackWriteAllowed: async () => fake.suporteLibera,
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () =>
    fake.admin
      ? { ok: true, user: { id: USER }, org: { orgId: ORG } }
      : {
          ok: false,
          response: NextResponse.json({ error: { code: "forbidden" } }, { status: 403 }),
        },
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: async (_a: unknown, claro: string) =>
    fake.cifraOk ? `cifrado(${claro.length})` : null,
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({
  CAMINHO_DO_CALLBACK: "/api/v1/plataformas-de-anuncio/meta/callback",
  configuracaoDoMetaAds: () =>
    fake.configurado
      ? { appId: "111", appSecret: "SEGREDO-DO-APP", redirectUri: "http://localhost:3000/cb" }
      : null,
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/token", () => ({
  obterTokenLongo: async () => {
    fake.trocas += 1;
    return fake.troca.ok
      ? {
          ok: true,
          token: { access_token: "TOKEN-LONGO-EM-CLARO", expira_em: "2026-12-23T00:00:00.000Z" },
        }
      : fake.troca;
  },
  lerPerfilDoToken: async () => ({ metaUserId: "999", scopes: ["ads_read"] }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      insert: async (linha: { nonce: string }) => {
        if (fake.nonces.has(linha.nonce))
          return { error: { code: "23505", message: "duplicate key" } };
        fake.nonces.add(linha.nonce);
        return { error: null };
      },
      upsert: async (valores: Record<string, unknown>, opcoes: unknown) => {
        fake.upserts.push({ tabela, valores, opcoes });
        return { error: fake.erroDoUpsert };
      },
    }),
  }),
}));

beforeEach(() => {
  fake.configurado = true;
  fake.admin = true;
  fake.suporteLibera = true;
  fake.cifraOk = true;
  fake.nonces.clear();
  fake.trocas = 0;
  fake.troca = { ok: true };
  fake.upserts = [];
  fake.erroDoUpsert = null;
  fake.audits = [];
  fake.logs = [];
});

async function comecar() {
  const { GET } = await import("@/app/api/v1/plataformas-de-anuncio/meta/connect/route");
  return GET(new NextRequest("http://localhost/api/v1/plataformas-de-anuncio/meta/connect"));
}

async function iniciado(): Promise<{ state: string; cookie: string }> {
  const resposta = await comecar();
  const state = new URL(resposta.headers.get("location")!).searchParams.get("state")!;
  return { state, cookie: `crm_oauth_bind=${resposta.cookies.get("crm_oauth_bind")!.value}` };
}

async function voltar(query: string, cookie?: string) {
  const { GET } = await import("@/app/api/v1/plataformas-de-anuncio/meta/callback/route");
  const resposta = await GET(
    new NextRequest(`http://localhost${CALLBACK}?${query}`, { headers: cookie ? { cookie } : {} }),
  );
  const destino = new URL(resposta.headers.get("location")!);
  return {
    caminho: destino.pathname,
    conectado: destino.searchParams.get("conectado"),
    erro: destino.searchParams.get("erro"),
    destino: destino.toString(),
  };
}

describe("connect", () => {
  it("manda ao consentimento da Meta com state e cookie de vínculo restrito ao callback", async () => {
    const resposta = await comecar();
    const alvo = new URL(resposta.headers.get("location")!);
    expect(alvo.hostname).toBe("www.facebook.com");
    expect(alvo.searchParams.get("state")).toBeTruthy();
    const cookie = resposta.cookies.get("crm_oauth_bind");
    expect(cookie).toMatchObject({ path: CALLBACK, httpOnly: true, sameSite: "lax" });
  });

  it("sem admin recusa e não redireciona para a Meta", async () => {
    fake.admin = false;
    const resposta = await comecar();
    expect(resposta.status).toBe(403);
    expect(resposta.headers.get("location")).toBeNull();
  });

  it("sem as envs volta à tela com meta_nao_configurado, sem cookie", async () => {
    fake.configurado = false;
    const resposta = await comecar();
    const alvo = new URL(resposta.headers.get("location")!);
    expect(alvo.pathname).toBe("/app/settings/meta-ads");
    expect(alvo.searchParams.get("erro")).toBe("meta_nao_configurado");
    expect(resposta.cookies.get("crm_oauth_bind")).toBeUndefined();
  });
});

describe("callback", () => {
  it("sucesso: grava cifrado por organização e plataforma, com validade, e audita sem token", async () => {
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);

    expect(r).toMatchObject({ caminho: "/app/settings/meta-ads", conectado: "1", erro: null });
    expect(fake.upserts).toHaveLength(1);
    const { tabela, valores, opcoes } = fake.upserts[0]!;
    expect(tabela).toBe("ad_insights_connections");
    expect(opcoes).toEqual({ onConflict: "organization_id,platform" });
    expect(valores).toMatchObject({
      organization_id: ORG,
      platform: "meta_ads",
      updated_by: USER,
      connected_via: "oauth",
      token_expires_at: "2026-12-23T00:00:00.000Z",
      scopes: ["ads_read"],
      meta_user_id: "999",
    });
    expect(valores.access_token_encrypted).toMatch(/^cifrado\(/);
    expect(JSON.stringify(valores)).not.toContain("TOKEN-LONGO-EM-CLARO");
    // reconectar não zera a conta padrão
    expect(valores).not.toHaveProperty("default_account_id");

    expect(fake.audits).toHaveLength(1);
    expect(fake.audits[0]).toMatchObject({
      action: "ad_insights_connection.updated",
      actorUserId: USER,
      organizationId: ORG,
      resourceType: "ad_insights_connections",
    });
    expect(JSON.stringify(fake.audits)).not.toContain("TOKEN-LONGO-EM-CLARO");
  });

  it("state inválido ou ausente: recusa sem trocar código", async () => {
    const { cookie } = await iniciado();
    expect((await voltar("code=c&state=lixo", cookie)).erro).toBe("estado_invalido");
    expect((await voltar("code=c", cookie)).erro).toBe("estado_invalido");
    expect(fake.trocas).toBe(0);
    expect(fake.upserts).toHaveLength(0);
  });

  it("sem o cookie do navegador que começou: recusa sem queimar nonce nem trocar código", async () => {
    const { state } = await iniciado();
    expect((await voltar(`code=c&state=${encodeURIComponent(state)}`)).erro).toBe(
      "estado_invalido",
    );
    expect(fake.nonces.size).toBe(0);
    expect(fake.trocas).toBe(0);
  });

  it("régua de suporte negada: recusa antes da troca", async () => {
    const { state, cookie } = await iniciado();
    fake.suporteLibera = false;
    expect((await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie)).erro).toBe(
      "estado_invalido",
    );
    expect(fake.trocas).toBe(0);
  });

  it("o retorno vale uma vez", async () => {
    const { state, cookie } = await iniciado();
    const q = `code=c&state=${encodeURIComponent(state)}`;
    expect((await voltar(q, cookie)).conectado).toBe("1");
    expect((await voltar(q, cookie)).erro).toBe("estado_invalido");
    expect(fake.trocas).toBe(1);
  });

  it("cancelar na Meta não é falha", async () => {
    expect((await voltar("error=access_denied&error_reason=user_denied")).erro).toBe("cancelado");
  });

  it("troca falhou: erro curto, nada gravado, e o log não carrega token nem segredo", async () => {
    fake.troca = {
      ok: false,
      motivo: "erro_da_meta",
      detalhe: "HTTP 400, codigo 100, tipo OAuthException",
    };
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=SEGREDO-CODIGO&state=${encodeURIComponent(state)}`, cookie);
    expect(r.erro).toBe("troca_falhou");
    expect(fake.upserts).toHaveLength(0);
    expect(r.destino).not.toContain("SEGREDO-CODIGO");
    expect(fake.logs.join()).not.toMatch(/SEGREDO-CODIGO|SEGREDO-DO-APP/);
  });

  it("sem chave de cifra: recusa e não grava em claro", async () => {
    fake.cifraOk = false;
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(r.erro).toBe("cifra_indisponivel");
    expect(fake.upserts).toHaveLength(0);
    expect(fake.audits).toHaveLength(0);
  });

  it("falha no upsert: erro_ao_gravar e sem auditoria", async () => {
    fake.erroDoUpsert = { message: "boom" };
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(r.erro).toBe("erro_ao_gravar");
    expect(fake.audits).toHaveLength(0);
  });

  it("instalação sem as envs: recusa na volta", async () => {
    const { state, cookie } = await iniciado();
    fake.configurado = false;
    expect((await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie)).erro).toBe(
      "meta_nao_configurado",
    );
    expect(fake.trocas).toBe(0);
  });
});
