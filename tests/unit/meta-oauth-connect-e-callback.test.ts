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
  papel: "admin" as string | null,
  anterior: null as Record<string, unknown> | null,
  perfil: { metaUserId: "999", scopes: ["ads_read"] as string[] | null },
  identidade: { nome: "Maria Souza", empresas: [{ id: "1", name: "BM A" }] } as
    | { nome: string | null; empresas: { id: string; name: string }[] }
    | "falha",
  atualizacoes: [] as Array<Record<string, unknown>>,
  erroDoUpdate: null as { message: string } | null,
  contas: { ok: true, dados: [{ id: "act_1" }, { id: "act_2" }] } as Record<string, unknown>,
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
vi.mock("@/lib/plataformas-de-anuncio/meta/insights", () => ({
  listarContas: async () => fake.contas,
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
  lerPerfilDoToken: async () => fake.perfil,
  lerIdentidadeDoToken: async () => {
    if (fake.identidade === "falha") throw new Error("rede");
    return fake.identidade;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () => {
        const cadeia = {
          eq: () => cadeia,
          maybeSingle: async () => ({
            data:
              tabela === "user_organizations"
                ? fake.papel
                  ? { role: fake.papel }
                  : null
                : fake.anterior,
            error: null,
          }),
        };
        return cadeia;
      },
      insert: async (linha: { nonce: string }) => {
        if (fake.nonces.has(linha.nonce))
          return { error: { code: "23505", message: "duplicate key" } };
        fake.nonces.add(linha.nonce);
        return { error: null };
      },
      update: (valores: Record<string, unknown>) => {
        fake.atualizacoes.push(valores);
        const cadeia = {
          eq: () => cadeia,
          then: (ok: (v: unknown) => unknown) => ok({ error: fake.erroDoUpdate }),
        };
        return cadeia;
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
  fake.papel = "admin";
  fake.anterior = null;
  fake.perfil = { metaUserId: "999", scopes: ["ads_read"] };
  fake.contas = { ok: true, dados: [{ id: "act_1" }, { id: "act_2" }] };
  fake.identidade = { nome: "Maria Souza", empresas: [{ id: "1", name: "BM A" }] };
  fake.atualizacoes = [];
  fake.erroDoUpdate = null;
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

/** Destino da ponte (200 + location.replace), no lugar do header Location. */
async function destinoDaPonte(res: Response): Promise<string> {
  const m = /location\.replace\((".*?")\)/.exec(await res.clone().text());
  return m ? (JSON.parse(m[1]) as string) : "";
}

async function voltar(query: string, cookie?: string) {
  const { GET } = await import("@/app/api/v1/plataformas-de-anuncio/meta/callback/route");
  const resposta = await GET(
    new NextRequest(`http://localhost${CALLBACK}?${query}`, { headers: cookie ? { cookie } : {} }),
  );
  const destino = new URL(await destinoDaPonte(resposta));
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
    expect(alvo.searchParams.get("scope")).toBe(
      "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement",
    );
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

  it("P1: state e vínculo da AGENDA do Google não valem aqui (mesma chave, outro propósito)", async () => {
    // Um `agent` pode iniciar o fluxo da Agenda. O state dela tem o mesmo formato e
    // a mesma chave: sem o propósito dentro da carga assinada, valeria como admin.
    const { emitirEstado: estadoDaAgenda } = await import("@/lib/agenda/google/estado");
    const { assinarVinculo } = await import("@/lib/agenda/google/vinculo");
    const state = estadoDaAgenda(
      { organizationId: ORG, userId: USER },
      { segredo: fake.env.INTERNAL_SECRET, agora: new Date(), nonce: "n-da-agenda" },
    );
    const cookie = `crm_oauth_bind=${assinarVinculo("n-da-agenda", fake.env.INTERNAL_SECRET)}`;
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(r.erro).toBe("estado_invalido");
    expect(fake.trocas).toBe(0);
    expect(fake.upserts).toHaveLength(0);
  });

  it("P1: o dono do state foi rebaixado a agent nos 10 minutos: recusa antes de queimar o nonce", async () => {
    const { state, cookie } = await iniciado();
    fake.papel = "agent";
    expect((await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie)).erro).toBe(
      "estado_invalido",
    );
    expect(fake.nonces.size).toBe(0);
    expect(fake.trocas).toBe(0);
    expect(fake.upserts).toHaveLength(0);
  });

  it("removido da organização: também recusa", async () => {
    const { state, cookie } = await iniciado();
    fake.papel = null;
    expect((await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie)).erro).toBe(
      "estado_invalido",
    );
    expect(fake.upserts).toHaveLength(0);
  });

  it("verificação: devolve só contagens (contas e bms), sem nome nem token na URL", async () => {
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    const alvo = new URL(r.destino);
    expect(alvo.searchParams.get("contas")).toBe("2");
    expect(alvo.searchParams.get("bms")).toBe("1");
    expect(r.destino).not.toContain("TOKEN-LONGO-EM-CLARO");
    expect(r.destino).not.toContain("Maria");
    expect(r.destino).not.toContain("BM%20A");
  });

  it("grava a identidade (nome e empresas) depois da conexão", async () => {
    const { state, cookie } = await iniciado();
    await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(fake.atualizacoes).toEqual([
      { meta_user_name: "Maria Souza", meta_businesses: [{ id: "1", name: "BM A" }] },
    ]);
  });

  it("identidade que falha (lançando ou erro de gravação) não desfaz a conexão", async () => {
    for (const falha of ["lanca", "grava"] as const) {
      fake.upserts = [];
      fake.nonces.clear();
      if (falha === "lanca") fake.identidade = "falha";
      else fake.erroDoUpdate = { message: "x" };
      const { state, cookie } = await iniciado();
      const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
      expect(r.conectado).toBe("1");
      expect(r.erro).toBeNull();
      expect(fake.upserts).toHaveLength(1);
    }
  });

  it("verificação com 0 contas: conexão gravada e aviso=sem_contas", async () => {
    fake.contas = { ok: true, dados: [] };
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(new URL(r.destino).searchParams.get("aviso")).toBe("sem_contas");
    expect(r.conectado).toBe("1");
    expect(fake.upserts).toHaveLength(1);
  });

  it("verificação que falha não desfaz a conexão: aviso=leitura_falhou", async () => {
    fake.contas = { ok: false, motivo: "token_invalido" };
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(new URL(r.destino).searchParams.get("aviso")).toBe("leitura_falhou");
    expect(r.conectado).toBe("1");
    expect(fake.upserts).toHaveLength(1);
  });

  it("sem ads_read concedido: recusa e não grava (a conexão ficaria falhando calada)", async () => {
    fake.perfil = { metaUserId: "999", scopes: ["pages_show_list"] };
    const { state, cookie } = await iniciado();
    const r = await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(r.erro).toBe("permissao_negada");
    expect(fake.upserts).toHaveLength(0);
  });

  it("lista de permissões ilegível: conecta, com scopes nulo (não inventa o que foi concedido)", async () => {
    fake.perfil = { metaUserId: "999", scopes: null };
    const { state, cookie } = await iniciado();
    expect((await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie)).conectado).toBe("1");
    expect(fake.upserts[0]!.valores.scopes).toBeNull();
  });

  it("outro usuário Meta: a conta padrão antiga é limpa, e a procedência anterior vai à auditoria", async () => {
    fake.anterior = { connected_via: "oauth", meta_user_id: "OUTRO" };
    const { state, cookie } = await iniciado();
    await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(fake.upserts[0]!.valores).toHaveProperty("default_account_id", null);
    expect(fake.upserts[0]!.valores).toHaveProperty("allowed_ad_account_ids", null);
    expect(fake.audits[0]!.metadata).toMatchObject({ via_anterior: "oauth", conta_padrao_limpa: true });
  });

  it("conexão anterior colada à mão: padrão e lista zeram (identidade desconhecida)", async () => {
    fake.anterior = { connected_via: "manual", meta_user_id: null };
    const { state, cookie } = await iniciado();
    await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(fake.upserts[0]!.valores).toHaveProperty("default_account_id", null);
    expect(fake.upserts[0]!.valores).toHaveProperty("allowed_ad_account_ids", null);
  });

  it("conexão OAuth anterior sem meta_user_id: zera", async () => {
    fake.anterior = { connected_via: "oauth", meta_user_id: null };
    const { state, cookie } = await iniciado();
    await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(fake.upserts[0]!.valores).toHaveProperty("allowed_ad_account_ids", null);
  });

  it("mesmo usuário Meta reconectando: a conta padrão fica", async () => {
    fake.anterior = { connected_via: "oauth", meta_user_id: "999" };
    const { state, cookie } = await iniciado();
    await voltar(`code=c&state=${encodeURIComponent(state)}`, cookie);
    expect(fake.upserts[0]!.valores).not.toHaveProperty("default_account_id");
    expect(fake.upserts[0]!.valores).not.toHaveProperty("allowed_ad_account_ids");
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
