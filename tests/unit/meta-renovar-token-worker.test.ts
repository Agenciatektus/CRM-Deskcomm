/**
 * A rodada que renova o token longo da Meta antes dos 60 dias.
 * As propriedades que importam: falha preserva o token antigo, conexão manual e
 * fora da janela nem é lida, a gravação NÃO desfaz o que a pessoa fez durante a
 * rodada (token novo colado, desconexão), a rodada respeita o orçamento de tempo,
 * e token nunca vai a log nem a auditoria.
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
  token_expires_at: string | null;
  needs_reconnect: boolean;
  needs_reconnect_desde: string | null;
  last_token_error: string | null;
}

/**
 * Dublê que aplica de verdade os filtros que a rota pede (a janela do SELECT e a
 * CONDIÇÃO do UPDATE), como o PostgREST faria. `aoGravar` roda entre a leitura e a
 * gravação: é onde o teste simula a pessoa mexendo na conexão.
 */
function bancoCom(linhas: Linha[], opcoes: { aoGravar?: (linhas: Linha[]) => void } = {}) {
  const updates: { filtros: Record<string, unknown>; valores: Record<string, unknown> }[] = [];
  const admin = {
    from: () => ({
      select: () => {
        const filtros: ((l: Linha) => boolean)[] = [];
        const consulta = {
          eq: (c: keyof Linha, v: unknown) => (filtros.push((l) => l[c] === v), consulta),
          gt: (c: keyof Linha, v: string) => (filtros.push((l) => String(l[c]) > v), consulta),
          lte: (c: keyof Linha, v: string) => (filtros.push((l) => String(l[c]) <= v), consulta),
          order: () => consulta,
          limit: () => Promise.resolve({ data: linhas.filter((l) => filtros.every((f) => f(l))).map((l) => ({ ...l })), error: null }),
        };
        return consulta;
      },
      update: (valores: Record<string, unknown>) => {
        const condicoes: Record<string, unknown> = {};
        const cadeia = {
          eq: (c: string, v: unknown) => ((condicoes[c] = v), cadeia),
          select: () => {
            opcoes.aoGravar?.(linhas);
            updates.push({ filtros: { ...condicoes }, valores });
            const alvo = linhas.filter((l) => Object.entries(condicoes).every(([c, v]) => l[c as keyof Linha] === v));
            for (const l of alvo) Object.assign(l, valores);
            return Promise.resolve({ data: alvo.map((l) => ({ organization_id: l.organization_id })), error: null });
          },
        };
        return cadeia;
      },
    }),
  };
  return { admin: admin as never, updates };
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
  needs_reconnect: false,
  needs_reconnect_desde: null,
  last_token_error: null,
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sucesso: troca SÓ o token e a validade, e só onde o token ainda é o lido", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const f = meta({ access_token: "TOKEN-NOVO", expires_in: 5184000 });
    const linhas = [linha()];
    const { admin, updates } = bancoCom(linhas);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ examinadas: 1, renovadas: 1, falhas: 0, superadas: 0, adiadas: 0 });
    expect(updates[0]!.valores).toEqual({
      access_token_encrypted: "ENC(TOKEN-NOVO)",
      token_expires_at: new Date(AGORA.getTime() + 5184000 * 1000).toISOString(),
      last_token_error: null,
    });
    // A condição do UPDATE é o que protege a linha de uma corrida.
    expect(updates[0]!.filtros).toMatchObject({ organization_id: "org-1", access_token_encrypted: "\\xAAAA", connected_via: "oauth" });
    // Procedência, escopos, usuário Meta, conta padrão e `updated_by` ficam como estão.
    expect(linhas[0]).toMatchObject({ meta_user_id: "u-9", scopes: ["ads_read"], default_account_id: "act_1", updated_by: "user-1" });
    const corpo = String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(corpo).toContain("grant_type=fb_exchange_token");
    expect(corpo).toContain("fb_exchange_token=TOKEN-ANTIGO");
  });

  it("CORRIDA: a pessoa colou um token novo durante a rodada, e a rodada NÃO o sobrescreve", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ access_token: "TOKEN-NOVO", expires_in: 5184000 });
    const linhas = [linha()];
    const { admin } = bancoCom(linhas, {
      aoGravar: (ls) => {
        ls[0]!.access_token_encrypted = "\\xBBBB-DO-USUARIO";
        ls[0]!.connected_via = "manual";
      },
    });

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ renovadas: 0, superadas: 1, falhas: 0 });
    expect(linhas[0]!.access_token_encrypted).toBe("\\xBBBB-DO-USUARIO");
    expect(audit).not.toHaveBeenCalled();
  });

  it("CORRIDA: a pessoa DESCONECTOU durante a rodada, e a rodada não recria a linha", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ access_token: "TOKEN-NOVO", expires_in: 5184000 });
    const linhas = [linha()];
    const { admin } = bancoCom(linhas, { aoGravar: (ls) => void ls.splice(0, ls.length) });

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ renovadas: 0, superadas: 1 });
    expect(linhas).toHaveLength(0);
  });

  it("falha da Meta: não grava nada (o token antigo fica), não audita e registra a organização e o motivo", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ error: { code: 1, type: "OAuthException", message: "TOKEN-ANTIGO falhou" } }, 400);
    const { admin, updates } = bancoCom([linha()]);
    const { logger } = await import("@/lib/logger");
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ renovadas: 0, falhas: 1 });
    expect(updates).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("não renovada"), expect.objectContaining({ organization_id: "org-1" }));
  });

  it("recusa 190: marca needs_reconnect com UPDATE condicional pelo token lido, só com códigos", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ error: { code: 190, error_subcode: 463, type: "OAuthException", message: "TOKEN-ANTIGO expirou" } }, 400);
    const linhas = [linha()];
    const { admin, updates } = bancoCom(linhas);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ recusadas: 1, renovadas: 0, falhas: 0 });
    expect(updates[0]!.filtros).toMatchObject({ access_token_encrypted: "\\xAAAA", connected_via: "oauth" });
    expect(linhas[0]).toMatchObject({ needs_reconnect: true, needs_reconnect_desde: AGORA.toISOString() });
    expect(linhas[0]!.last_token_error).toBe("Meta recusou a renovação (http 400, code 190, subcode 463, OAuthException)");
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain("TOKEN-ANTIGO");
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("recusa 102 também marca; is_transient, 190 sem transitório ausente e outros códigos NÃO", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ error: { code: 102, type: "OAuthException" } }, 400);
    const a = [linha()];
    await renovarTokensDaMeta(bancoCom(a).admin, { agora: AGORA });
    expect(a[0]!.needs_reconnect).toBe(true);

    for (const erro of [{ code: 190, is_transient: true }, { code: 4 }, { code: 2 }]) {
      meta({ error: erro }, 400);
      const b = [linha()];
      const r = await renovarTokensDaMeta(bancoCom(b).admin, { agora: AGORA });
      expect(b[0]!.needs_reconnect).toBe(false);
      expect(r).toMatchObject({ recusadas: 0, falhas: 1 });
    }
  });

  it("CORRIDA: a recusa NÃO marca se o token mudou no meio da rodada", async () => {
    const { renovarTokensDaMeta } = await carregar();
    meta({ error: { code: 190 } }, 400);
    const linhas = [linha()];
    const { admin } = bancoCom(linhas, { aoGravar: (ls) => (ls[0]!.access_token_encrypted = "\\xBBBB") });

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ recusadas: 0, superadas: 1 });
    expect(linhas[0]!.needs_reconnect).toBe(false);
  });

  it("conexão já marcada needs_reconnect não é relida pela renovação", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const f = meta({ access_token: "N", expires_in: 100 });
    const r = await renovarTokensDaMeta(bancoCom([linha({ needs_reconnect: true })]).admin, { agora: AGORA });
    expect(r.examinadas).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("sem expires_in: consulta o debug_token no servidor e grava a validade real", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const real = Math.floor(AGORA.getTime() / 1000) + 40 * 86400;
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "TOKEN-NOVO" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { expires_at: real } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const linhas = [linha()];

    const r = await renovarTokensDaMeta(bancoCom(linhas).admin, { agora: AGORA });

    expect(r.renovadas).toBe(1);
    expect(linhas[0]!.token_expires_at).toBe(new Date(real * 1000).toISOString());
    const url = String((f.mock.calls[1] as unknown as [string])[0]);
    expect(url).toContain("graph.facebook.com");
    expect(url).toContain("/debug_token?");
    expect(url).toContain("input_token=TOKEN-NOVO");
  });

  it("debug_token com expires_at 0: nunca expira, validade nula e fora da janela", async () => {
    const { renovarTokensDaMeta } = await carregar();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "TOKEN-NOVO" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: { expires_at: 0, is_valid: true } }), { status: 200 })),
    );
    const linhas = [linha()];
    const { admin } = bancoCom(linhas);

    await renovarTokensDaMeta(admin, { agora: AGORA });
    expect(linhas[0]!.token_expires_at).toBeNull();
    const r2 = await renovarTokensDaMeta(admin, { agora: AGORA });
    expect(r2.examinadas).toBe(0);
  });

  it("expires_at 0 SEM is_valid true não vale: mantém a data antiga", async () => {
    const { renovarTokensDaMeta } = await carregar();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "TOKEN-NOVO" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: { expires_at: 0, is_valid: false } }), { status: 200 })),
    );
    const antiga = new Date(AGORA.getTime() + 5 * DIA).toISOString();
    const linhas = [linha({ token_expires_at: antiga })];
    await renovarTokensDaMeta(bancoCom(linhas).admin, { agora: AGORA });
    expect(linhas[0]!.token_expires_at).toBe(antiga);
  });

  it("sem expires_in e debug_token falhando: grava o token novo e MANTÉM a data antiga", async () => {
    const { renovarTokensDaMeta } = await carregar();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "TOKEN-NOVO" }), { status: 200 }))
        .mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    const antiga = new Date(AGORA.getTime() + 5 * DIA).toISOString();
    const linhas = [linha({ token_expires_at: antiga })];

    const r = await renovarTokensDaMeta(bancoCom(linhas).admin, { agora: AGORA });

    expect(r.renovadas).toBe(1);
    expect(linhas[0]).toMatchObject({ access_token_encrypted: "ENC(TOKEN-NOVO)", token_expires_at: antiga });
  });

  it("uma falha não impede a renovação das outras", async () => {
    const { renovarTokensDaMeta } = await carregar();
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 1 } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "N2", expires_in: 100 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const { admin, updates } = bancoCom([linha(), linha({ organization_id: "org-2" })]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toMatchObject({ examinadas: 2, renovadas: 1, falhas: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.filtros).toMatchObject({ organization_id: "org-2" });
  });

  it("ORÇAMENTO DE TEMPO: passados 40 s a rodada para, deixa o resto para amanhã e ainda audita o que renovou", async () => {
    const { renovarTokensDaMeta, ORCAMENTO_DE_TEMPO_MS } = await carregar();
    meta({ access_token: "N", expires_in: 100 });
    const inicio = Date.now();
    let chamadas = 0;
    // O relógio salta além do orçamento depois da primeira conexão.
    vi.spyOn(Date, "now").mockImplementation(() => (chamadas++ < 2 ? inicio : inicio + ORCAMENTO_DE_TEMPO_MS + 1_000));
    const { admin, updates } = bancoCom([linha(), linha({ organization_id: "org-2" }), linha({ organization_id: "org-3" })]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r.renovadas).toBe(1);
    expect(r.adiadas).toBe(2);
    expect(updates).toHaveLength(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ metadata: { renovadas: 1, adiadas: 2 } });
  });

  it("sem app OAuth: resumo semAppOAuth, sem rede, sem erro", async () => {
    const { renovarTokensDaMeta } = await carregar({ META_ADS_OAUTH_APP_ID: "", META_ADS_OAUTH_APP_SECRET: "" });
    const f = meta({});
    const { admin } = bancoCom([linha()]);

    const r = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r).toEqual({ examinadas: 0, renovadas: 0, falhas: 0, recusadas: 0, superadas: 0, adiadas: 0, semAppOAuth: true });
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
    const { admin, updates } = bancoCom([linha()]);

    await renovarTokensDaMeta(admin, { agora: AGORA });
    const r2 = await renovarTokensDaMeta(admin, { agora: AGORA });

    expect(r2.renovadas).toBe(0);
    expect(updates).toHaveLength(1);
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
  });
});
