import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ role: vi.fn(), mfa: vi.fn(), estado: vi.fn(), codigo: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: h.mfa }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/connect", () => ({
  estadoDaConexaoHospedada: h.estado,
  codigoHospedadoPorNumero: h.codigo,
}));

import { GET } from "./route";
import { POST } from "../codigo-nativo/route";

const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id }) };
const get = () => GET(new Request("http://x/api"), ctx);
const post = (body: unknown = { telefone: "11912345678" }) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  h.role.mockResolvedValue({ ok: true, org: { orgId: "org-da-sessao" }, user: { id: "admin", idioma: "pt-BR" } });
  h.mfa.mockResolvedValue(false);
});

describe("GET conexao-nativa", () => {
  it("200 no-store, org da SESSAO, QR no JSON", async () => {
    h.estado.mockResolvedValue({ status: 200, corpo: { estado: "aguardando_leitura", qr: "data:image/png;base64,AA==", atualizado_em: "x" } });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect((await r.json()).data.estado).toBe("aguardando_leitura");
    expect(h.estado.mock.calls[0]![1]).toBe("org-da-sessao");
    expect(h.role).toHaveBeenCalledWith("admin", expect.anything());
  });
  it("403 nao admin e MFA em divida, sem chamar a lib", async () => {
    h.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await get()).status).toBe(403);
    h.role.mockResolvedValue({ ok: true, org: { orgId: "o" }, user: { id: "a", idioma: "pt-BR" } });
    h.mfa.mockResolvedValue(true);
    expect((await get()).status).toBe(403);
    expect(h.estado).not.toHaveBeenCalled();
  });
  it("404 canal de outra org ou nao nativo, 409 arquivado, 429 com Retry-After; todos no-store", async () => {
    h.estado.mockResolvedValueOnce(null);
    const a = await get();
    expect(a.status).toBe(404);
    expect(a.headers.get("cache-control")).toContain("no-store");
    h.estado.mockResolvedValueOnce({ status: 409, estado: "archived" });
    const b = await get();
    expect(b.status).toBe(409);
    expect(b.headers.get("cache-control")).toContain("no-store");
    h.estado.mockResolvedValueOnce({ status: 429, estado: "rate-limited", retryAfter: 15 });
    const c = await get();
    expect(c.status).toBe(429);
    expect(c.headers.get("retry-after")).toBe("15");
  });
});

describe("POST codigo-nativo", () => {
  it("200 com o codigo, no-store", async () => {
    h.codigo.mockResolvedValue({ status: 200, corpo: { codigo: "ABCD-1234" } });
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect((await r.json()).data.codigo).toBe("ABCD-1234");
    expect(h.codigo.mock.calls[0]![1]).toBe("org-da-sessao");
  });
  it("400 corpo invalido, 403 nao admin, 404, 409 e 429", async () => {
    expect((await post({ x: 1 })).status).toBe(400);
    h.codigo.mockResolvedValueOnce(null);
    expect((await post()).status).toBe(404);
    h.codigo.mockResolvedValueOnce({ status: 409, estado: "archived" });
    expect((await post()).status).toBe(409);
    h.codigo.mockResolvedValueOnce({ status: 429, estado: "rate-limited", retryAfter: 30 });
    const r = await post();
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("30");
    h.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await post()).status).toBe(403);
  });
});
