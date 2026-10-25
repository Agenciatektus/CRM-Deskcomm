import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireRole: vi.fn(),
  lerCredencial: vi.fn(),
  listarPixels: vi.fn(),
  listarPaginas: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mock.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais-de-leitura", () => ({
  lerCredencialDeLeitura: mock.lerCredencial,
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/insights", () => ({
  listarPixels: mock.listarPixels,
  listarPaginas: mock.listarPaginas,
}));

import { GET as pages } from "@/app/api/v1/ads/meta/pages/route";
import { GET as pixels } from "@/app/api/v1/ads/meta/pixels/route";

const pedido = (q = "") => new Request(`http://x/api/v1/ads/meta/pixels${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  mock.requireRole.mockResolvedValue({ ok: true, org: { orgId: "org-ativa" } });
  mock.lerCredencial.mockResolvedValue({
    ok: true,
    credencial: { accessToken: "tok", contaPadrao: "act_1" },
  });
});

describe("GET /ads/meta/pixels", () => {
  it("exige o papel admin e para no 403 do gate", async () => {
    mock.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const r = await pixels(pedido("?conta=act_1"));
    expect(r.status).toBe(403);
    expect(mock.requireRole.mock.calls[0]![0]).toBe("admin");
    expect(mock.lerCredencial).not.toHaveBeenCalled();
  });

  it("recusa conta inválida", async () => {
    const r = await pixels(pedido("?conta=1"));
    expect(r.status).toBe(422);
    expect(mock.listarPixels).not.toHaveBeenCalled();
  });

  it("sem conexão de leitura devolve ads_sem_conexao", async () => {
    mock.lerCredencial.mockResolvedValue({ ok: false, motivo: "sem_conexao" });
    const r = await pixels(pedido("?conta=act_1"));
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe("ads_sem_conexao");
  });

  it("sucesso: usa a org ativa e devolve os pixels", async () => {
    mock.listarPixels.mockResolvedValue({ ok: true, dados: [{ id: "5", nome: "P" }] });
    const r = await pixels(pedido("?conta=act_1&organization_id=outra"));
    expect(r.status).toBe(200);
    expect((await r.json()).data.pixels).toEqual([{ id: "5", nome: "P" }]);
    expect(mock.lerCredencial.mock.calls[0]![1]).toBe("org-ativa");
    expect(mock.listarPixels).toHaveBeenCalledWith("tok", "act_1");
  });

  it("falha da Graph vira o código da família ads_", async () => {
    mock.listarPixels.mockResolvedValue({ ok: false, falha: "token_invalido", detalhe: "x" });
    const r = await pixels(pedido("?conta=act_1"));
    expect((await r.json()).error.code).toBe("ads_token_invalido");
  });
});

describe("GET /ads/meta/pages", () => {
  it("sem papel admin para no gate", async () => {
    mock.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await pages()).status).toBe(403);
    expect(mock.requireRole.mock.calls[0]![0]).toBe("admin");
  });

  it("sem conexão devolve ads_sem_conexao", async () => {
    mock.lerCredencial.mockResolvedValue({ ok: false, motivo: "sem_conexao" });
    expect((await (await pages()).json()).error.code).toBe("ads_sem_conexao");
  });

  it("sucesso devolve as Páginas", async () => {
    mock.listarPaginas.mockResolvedValue({ ok: true, dados: [{ id: "9", nome: "Loja" }] });
    const r = await pages();
    expect((await r.json()).data.paginas).toEqual([{ id: "9", nome: "Loja" }]);
  });
});
