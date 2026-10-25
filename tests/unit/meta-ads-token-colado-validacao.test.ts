import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  usuario: { id: "u1", is_platform_admin: false, platform_admin_scope: null, support: null } as Record<string, unknown>,
  linha: null as Record<string, unknown> | null,
  gravar: vi.fn(),
  audit: vi.fn(),
  validar: vi.fn(),
  limite: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/http/ip-do-cliente", () => ({ ipDoCliente: () => undefined }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/audit", () => ({ audit: mock.audit }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => mock.usuario,
  resolveActiveOrg: async () => ({ orgId: "org" }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mock.linha, error: null }) }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura", () => ({ gravarConexaoDeLeitura: mock.gravar }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: mock.limite }));
vi.mock("@/lib/plataformas-de-anuncio/meta/validar-token-colado", () => ({ validarTokenColado: mock.validar }));

import { updateAdInsightsConnection } from "@/app/actions/settings/updateAdInsightsConnection";

const TOKEN = "EAAtokensecretoquenuncadevesair1234567890";
const entrada = { platform: "meta_ads" as const, access_token: TOKEN };

beforeEach(() => {
  vi.clearAllMocks();
  mock.gravar.mockResolvedValue({ ok: true });
  mock.limite.mockResolvedValue({ allowed: true });
  mock.usuario = { id: "u1", is_platform_admin: false, platform_admin_scope: null, support: null };
  mock.linha = null;
  mock.validar.mockResolvedValue({ ok: true, expiraEm: null, appId: "123", contas: ["act_1", "act_2"] });
});

describe("token colado: recusas antes de gravar", () => {
  for (const motivo of ["token_invalido", "token_de_pagina", "sem_ads_read", "sem_contas", "validacao_indisponivel"]) {
    it(`devolve ${motivo} sem gravar e sem eco do token`, async () => {
      mock.validar.mockResolvedValue({ ok: false, motivo });
      const r = await updateAdInsightsConnection(entrada);
      expect(r).toEqual({ ok: false, error: motivo });
      expect(mock.gravar).not.toHaveBeenCalled();
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    });
  }

  it("rate limit de 5 por minuto por usuário", async () => {
    mock.limite.mockResolvedValue({ allowed: false });
    const r = await updateAdInsightsConnection(entrada);
    expect(r).toEqual({ ok: false, error: "rate_limited" });
    expect(mock.limite).toHaveBeenCalledWith("meta-token-colado:u1", 5, 60);
    expect(mock.validar).not.toHaveBeenCalled();
  });
});

describe("token colado: gravação", () => {
  it("grava a validade real e nunca vaza o token em auditoria", async () => {
    mock.validar.mockResolvedValue({ ok: true, expiraEm: "2026-12-01T00:00:00.000Z", appId: "123", contas: ["act_1"] });
    expect(await updateAdInsightsConnection(entrada)).toEqual({ ok: true });
    expect(mock.gravar.mock.calls[0]![1]).toMatchObject({ expiraEmColado: "2026-12-01T00:00:00.000Z" });
    expect(JSON.stringify(mock.audit.mock.calls)).not.toContain(TOKEN);
    expect(mock.audit.mock.calls[0]![0].metadata).toMatchObject({ token_app_id: "123", token_com_validade: true });
  });

  it("nunca expira vira validade nula", async () => {
    await updateAdInsightsConnection(entrada);
    expect(mock.gravar.mock.calls[0]![1].expiraEmColado).toBeNull();
  });
});

describe("token colado: conexão existente", () => {
  const manualDoMesmoDono = {
    connected_by: "u1",
    connected_via: "manual",
    default_account_id: "act_1",
    allowed_ad_account_ids: ["act_1", "act_2"],
  };

  it("pede confirmação quando o novo token enxerga menos contas, só com contagens", async () => {
    mock.linha = manualDoMesmoDono;
    mock.validar.mockResolvedValue({ ok: true, expiraEm: null, appId: null, contas: ["act_1"] });
    const r = await updateAdInsightsConnection(entrada);
    expect(r).toEqual({ ok: false, error: "precisa_confirmar", details: { atuais: 2, visiveis: 1 } });
    expect(mock.gravar).not.toHaveBeenCalled();
  });

  it("grava com confirmar:true", async () => {
    mock.linha = manualDoMesmoDono;
    mock.validar.mockResolvedValue({ ok: true, expiraEm: null, appId: null, contas: ["act_1"] });
    expect(await updateAdInsightsConnection({ ...entrada, confirmar: true })).toEqual({ ok: true });
  });

  it("não pede confirmação quando o token enxerga todas as liberadas", async () => {
    mock.linha = manualDoMesmoDono;
    expect(await updateAdInsightsConnection(entrada)).toEqual({ ok: true });
  });

  it("sem lista restrita, troca de dono só limpa a conta padrão", async () => {
    mock.linha = { ...manualDoMesmoDono, connected_by: "outro", allowed_ad_account_ids: null };
    const r = await updateAdInsightsConnection({ ...entrada, default_account_id: "act_9" });
    expect(r).toEqual({ ok: true });
    expect(mock.gravar.mock.calls[0]![1]).toMatchObject({ defaultAccountId: null });
    expect(mock.gravar.mock.calls[0]![1].allowedAdAccountIds).toBeUndefined();
  });

  it("OAuth restrito: grava a interseção com o que o token enxerga, nunca null (mesmo usuário e platform admin)", async () => {
    mock.linha = { ...manualDoMesmoDono, connected_via: "oauth", allowed_ad_account_ids: ["act_1"], default_account_id: "act_1" };
    for (const usuario of [
      { id: "u1", is_platform_admin: false, platform_admin_scope: null, support: null },
      { id: "adm", is_platform_admin: true, platform_admin_scope: "write", support: null },
    ]) {
      mock.usuario = usuario;
      mock.gravar.mockClear();
      expect(await updateAdInsightsConnection(entrada)).toEqual({ ok: true });
      expect(mock.gravar.mock.calls[0]![1]).toMatchObject({ allowedAdAccountIds: ["act_1"], defaultAccountId: "act_1" });
    }
  });

  it("interseção vazia: precisa_confirmar, nunca grava sem restrição", async () => {
    mock.linha = { ...manualDoMesmoDono, connected_via: "oauth", allowed_ad_account_ids: ["act_9"] };
    const r = await updateAdInsightsConnection({ ...entrada, confirmar: true });
    expect(r).toMatchObject({ ok: false, error: "precisa_confirmar" });
    expect(mock.gravar).not.toHaveBeenCalled();
  });

  it("grava condicionado ao estado lido e repassa superada", async () => {
    mock.linha = { ...manualDoMesmoDono, updated_at: "2026-10-25T10:00:00Z" };
    mock.gravar.mockResolvedValue({ ok: false, error: "superada" });
    expect(await updateAdInsightsConnection(entrada)).toMatchObject({ ok: false, error: "superada" });
    expect(mock.gravar.mock.calls[0]![1]).toMatchObject({ lidoEm: "2026-10-25T10:00:00Z" });
  });

  it("admin que não conectou grava só a interseção com a lista atual", async () => {
    mock.linha = { ...manualDoMesmoDono, connected_by: "outro" };
    expect(await updateAdInsightsConnection(entrada)).toEqual({ ok: true });
    expect(mock.gravar.mock.calls[0]![1]).toMatchObject({ allowedAdAccountIds: ["act_1", "act_2"] });
  });
});
