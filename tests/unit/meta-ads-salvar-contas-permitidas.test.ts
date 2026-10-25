import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  podeAdministrar: vi.fn(),
  usuario: { id: "u1", is_platform_admin: false, platform_admin_scope: null, support: null } as Record<string, unknown>,
  linha: {} as Record<string, unknown>,
  gravar: vi.fn(),
  audit: vi.fn(),
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
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: mock.podeAdministrar }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mock.linha, error: null }) }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura", () => ({
  gravarConexaoDeLeitura: mock.gravar,
}));

import { updateAdInsightsConnection } from "@/app/actions/settings/updateAdInsightsConnection";

beforeEach(() => {
  vi.clearAllMocks();
  mock.podeAdministrar.mockReturnValue(true);
  mock.gravar.mockResolvedValue({ ok: true });
  mock.usuario = { id: "u1", is_platform_admin: false, platform_admin_scope: null, support: null };
  mock.linha = { id: "x", connected_by: "u1", connected_via: "oauth", default_account_id: "act_1", allowed_ad_account_ids: ["act_1", "act_2"] };
});

describe("salvar contas permitidas", () => {
  it("exige admin", async () => {
    mock.podeAdministrar.mockReturnValue(false);
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_1"],
      default_account_id: "act_1",
    });
    expect(r).toMatchObject({ ok: false, error: "forbidden_role" });
    expect(mock.gravar).not.toHaveBeenCalled();
  });

  it("recusa padrão fora da lista", async () => {
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_1"],
      default_account_id: "act_2",
    });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mock.gravar).not.toHaveBeenCalled();
  });

  it("recusa lista sem a conta padrão informada", async () => {
    const r = await updateAdInsightsConnection({ platform: "meta_ads", allowed_ad_account_ids: ["act_1"] });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
  });

  it("grava a lista e audita", async () => {
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_1", "act_2"],
      default_account_id: "act_2",
    });
    expect(r).toEqual({ ok: true });
    expect(mock.gravar.mock.calls[0]![1]).toMatchObject({
      allowedAdAccountIds: ["act_1", "act_2"],
      defaultAccountId: "act_2",
    });
    expect(mock.audit.mock.calls[0]![0].metadata).toMatchObject({ allowed_ad_account_ids: ["act_1", "act_2"] });
  });
});

describe("quem pode ampliar a lista", () => {
  const outro = () => {
    mock.usuario = { id: "outro-admin", is_platform_admin: false, platform_admin_scope: null, support: null };
  };

  it("outro admin da org NÃO inclui conta fora da lista atual (forbidden_role)", async () => {
    outro();
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_1", "act_36"],
      default_account_id: "act_1",
    });
    expect(r).toMatchObject({ ok: false, error: "forbidden_role" });
    expect(mock.gravar).not.toHaveBeenCalled();
  });

  it("outro admin NÃO põe padrão fora da lista liberada", async () => {
    outro();
    const r = await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: "act_36" });
    expect(r).toMatchObject({ ok: false, error: "forbidden_role" });
  });

  it("outro admin pode reduzir a lista e escolher a padrão dentro dela", async () => {
    outro();
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_2"],
      default_account_id: "act_2",
    });
    expect(r).toEqual({ ok: true });
  });

  it("outro admin não limpa a lista (null amplia no OAuth)", async () => {
    outro();
    const r = await updateAdInsightsConnection({ platform: "meta_ads", allowed_ad_account_ids: null, default_account_id: null });
    expect(r).toMatchObject({ ok: false, error: "forbidden_role" });
  });

  it("conexão antiga (connected_by nulo): admin comum não amplia, platform admin amplia", async () => {
    mock.linha = { ...mock.linha, connected_by: null };
    const pedido = { platform: "meta_ads" as const, allowed_ad_account_ids: ["act_1", "act_36"], default_account_id: "act_1" };
    expect(await updateAdInsightsConnection(pedido)).toMatchObject({ ok: false, error: "forbidden_role" });
    mock.usuario = { id: "pa", is_platform_admin: true, platform_admin_scope: "full", support: null };
    expect(await updateAdInsightsConnection(pedido)).toEqual({ ok: true });
  });

  it("quem conectou amplia", async () => {
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_1", "act_36"],
      default_account_id: "act_36",
    });
    expect(r).toEqual({ ok: true });
  });

  it("ids acima de 32 caracteres são recusados", async () => {
    const r = await updateAdInsightsConnection({
      platform: "meta_ads",
      allowed_ad_account_ids: ["act_" + "1".repeat(40)],
      default_account_id: null,
    });
    expect(r).toMatchObject({ ok: false, error: "validation_failed" });
  });
});
