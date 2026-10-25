import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireRole: vi.fn(),
  lerCredencial: vi.fn(),
  listarContas: vi.fn(),
  listarPixels: vi.fn(),
  lerCampanhas: vi.fn(),
  lerInsights: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mock.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais-de-leitura", () => ({
  lerCredencialDeLeitura: mock.lerCredencial,
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/insights", () => ({
  listarContas: mock.listarContas,
  listarPixels: mock.listarPixels,
  lerCampanhas: mock.lerCampanhas,
  lerInsights: mock.lerInsights,
}));

import { GET as accounts } from "@/app/api/v1/ads/meta/accounts/route";
import { GET as campaigns } from "@/app/api/v1/ads/meta/campaigns/route";
import { GET as pixels } from "@/app/api/v1/ads/meta/pixels/route";

const TODAS = [
  { id: "act_1", nome: "Do cliente", moeda: "BRL", status: 1 },
  { id: "act_2", nome: "De outro cliente", moeda: "BRL", status: 1 },
];

const CONECTOU = { id: "u1", is_platform_admin: false, platform_admin_scope: null, support: null };

function credencial(permitidas: string[] | null, connectedBy: string | null = "u1") {
  mock.lerCredencial.mockResolvedValue({
    ok: true,
    credencial: { accessToken: "tok", contaPadrao: "act_1", contasPermitidas: permitidas, connectedBy },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.requireRole.mockResolvedValue({ ok: true, org: { orgId: "org" }, user: CONECTOU });
  credencial(["act_1"]);
  mock.listarContas.mockResolvedValue({ ok: true, dados: TODAS });
});

describe("accounts", () => {
  it("manager só vê as permitidas", async () => {
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts"));
    const d = (await r.json()).data;
    expect(d.contas.map((c: { id: string }) => c.id)).toEqual(["act_1"]);
    expect(mock.requireRole.mock.calls[0]![0]).toBe("manager");
  });

  it("lista efetiva vazia: nem chama a Graph", async () => {
    credencial([]);
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts"));
    expect((await r.json()).data.contas).toEqual([]);
    expect(mock.listarContas).not.toHaveBeenCalled();
  });

  it("?todas=1 exige admin e devolve tudo", async () => {
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts?todas=1"));
    expect(mock.requireRole.mock.calls[0]![0]).toBe("admin");
    expect((await r.json()).data.contas).toHaveLength(2);
  });

  it("?todas=1 por admin que não conectou: 403 forbidden_role, sem Graph", async () => {
    mock.requireRole.mockResolvedValue({ ok: true, org: { orgId: "org" }, user: { ...CONECTOU, id: "outro" } });
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts?todas=1"));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("forbidden_role");
    expect(mock.listarContas).not.toHaveBeenCalled();
  });

  it("?todas=1 em conexão antiga (connected_by nulo): só platform admin", async () => {
    credencial(["act_1"], null);
    expect((await accounts(new Request("http://x/api/v1/ads/meta/accounts?todas=1"))).status).toBe(403);
    mock.requireRole.mockResolvedValue({
      ok: true,
      org: { orgId: "org" },
      user: { ...CONECTOU, id: "pa", is_platform_admin: true, platform_admin_scope: "full" },
    });
    expect((await accounts(new Request("http://x/api/v1/ads/meta/accounts?todas=1"))).status).toBe(200);
  });

  it("admin que não conectou ainda vê as liberadas pela rota normal", async () => {
    mock.requireRole.mockResolvedValue({ ok: true, org: { orgId: "org" }, user: { ...CONECTOU, id: "outro" } });
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts"));
    expect((await r.json()).data.contas.map((c: { id: string }) => c.id)).toEqual(["act_1"]);
  });

  it("?todas=1 sem admin para no gate", async () => {
    mock.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts?todas=1"));
    expect(r.status).toBe(403);
    expect(mock.listarContas).not.toHaveBeenCalled();
  });

  it("sem restrição (token manual) devolve tudo", async () => {
    credencial(null);
    const r = await accounts(new Request("http://x/api/v1/ads/meta/accounts"));
    expect((await r.json()).data.contas).toHaveLength(2);
  });
});

describe("campaigns e pixels", () => {
  it("campaigns: conta fora da lista = 403 sem chamar a Graph", async () => {
    const { NextRequest } = await import("next/server");
    const r = await campaigns(new NextRequest("http://x/api/v1/ads/meta/campaigns?account_id=act_2"));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("ads_conta_nao_permitida");
    expect(mock.lerCampanhas).not.toHaveBeenCalled();
    expect(mock.lerInsights).not.toHaveBeenCalled();
  });

  it("pixels: conta fora da lista = 403 sem chamar a Graph", async () => {
    const r = await pixels(new Request("http://x/api/v1/ads/meta/pixels?conta=act_2"));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("ads_conta_nao_permitida");
    expect(mock.listarPixels).not.toHaveBeenCalled();
  });

  it("pixels: conta da lista segue para a Graph", async () => {
    mock.listarPixels.mockResolvedValue({ ok: true, dados: [] });
    const r = await pixels(new Request("http://x/api/v1/ads/meta/pixels?conta=act_1"));
    expect(r.status).toBe(200);
    expect(mock.listarPixels).toHaveBeenCalled();
  });
});
