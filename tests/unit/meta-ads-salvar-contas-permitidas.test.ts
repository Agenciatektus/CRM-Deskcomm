import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  podeAdministrar: vi.fn(),
  gravar: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/http/ip-do-cliente", () => ({ ipDoCliente: () => undefined }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: () => null }));
vi.mock("@/lib/audit", () => ({ audit: mock.audit }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "u1" }),
  resolveActiveOrg: async () => ({ orgId: "org" }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/auth/pode-administrar-empresa", () => ({ podeAdministrarEmpresa: mock.podeAdministrar }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "x" }, error: null }) }) }),
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
