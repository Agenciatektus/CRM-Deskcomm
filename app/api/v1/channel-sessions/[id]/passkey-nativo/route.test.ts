import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ role: vi.fn(), mfa: vi.fn(), enviar: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: h.mfa }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/connect", () => ({ enviarPasskeyHospedada: h.enviar, PASSKEY_MAX_BYTES: 8192 }));

import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id }) };
const A = { rawId: "AQID", response: { clientDataJSON: "eyJ", signature: "MEU" } };
const post = (body: unknown = A, raw?: string) =>
  POST(new Request("http://x/api", { method: "POST", body: raw ?? JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  h.role.mockResolvedValue({ ok: true, org: { orgId: "org-da-sessao" }, user: { id: "admin", idioma: "pt-BR" } });
  h.mfa.mockResolvedValue(false);
});

describe("POST passkey-nativo", () => {
  it("200 no-store, org da SESSAO, assertion repassada para a lib", async () => {
    h.enviar.mockResolvedValue({ status: 200, corpo: { ok: true } });
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(h.enviar.mock.calls[0]![1]).toBe("org-da-sessao");
    expect(h.enviar.mock.calls[0]![3]).toEqual(A);
  });

  it("403 nao admin e MFA em divida, sem chamar a lib", async () => {
    h.mfa.mockResolvedValue(true);
    expect((await post()).status).toBe(403);
    h.mfa.mockResolvedValue(false);
    h.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await post()).status).toBe(403);
    expect(h.enviar).not.toHaveBeenCalled();
  });

  it("400 para corpo grande (por tamanho real), vazio ou nao JSON, sem chamar a lib", async () => {
    for (const raw of ["x".repeat(9000), "", "{nao json"]) {
      const r = await post(null, raw);
      expect(r.status).toBe(400);
      expect(r.headers.get("cache-control")).toContain("no-store");
    }
    expect(h.enviar).not.toHaveBeenCalled();
  });

  it("404 outra org/nao nativo, 409, 429 com Retry-After, 502; todos no-store e sem eco da assertion", async () => {
    h.enviar.mockResolvedValueOnce(null);
    expect((await post()).status).toBe(404);
    h.enviar.mockResolvedValueOnce({ status: 409, estado: "connected" });
    expect((await post()).status).toBe(409);
    h.enviar.mockResolvedValueOnce({ status: 429, estado: "rate-limited", retryAfter: 15 });
    const c = await post();
    expect(c.status).toBe(429);
    expect(c.headers.get("retry-after")).toBe("15");
    h.enviar.mockResolvedValueOnce({ status: 502, estado: "upstream-failed" });
    const d = await post();
    expect(d.status).toBe(502);
    expect(d.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(await d.json())).not.toContain("MEU");
  });
});
