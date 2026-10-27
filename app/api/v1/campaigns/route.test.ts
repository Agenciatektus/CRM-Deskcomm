/**
 * Papéis das campanhas: o `agent` LÊ a lista (sem `passos`), o resto segue de manager+.
 * `requireRole` é simulado pelo rank real; controle negativo: agent não escreve nem dispara.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLE_RANK, type Role } from "@/lib/auth/types";

const sessao = vi.hoisted(() => ({ role: null as string | null, admin: false }));
const select = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/require-role", async () => {
  const { ROLE_RANK } = await vi.importActual<typeof import("@/lib/auth/types")>("@/lib/auth/types");
  return {
    requireRole: vi.fn(async (min: Role) => {
      const r = (c: number, code: string) => ({ ok: false, response: Response.json({ error: { code } }, { status: c }) });
      if (!sessao.role) return r(401, "unauthorized");
      if (ROLE_RANK[sessao.role as Role] < ROLE_RANK[min]) return r(403, "forbidden");
      return { ok: true, user: { idioma: "pt-BR", is_platform_admin: sessao.admin, platform_admin_scope: sessao.admin ? "full" : null, support: null }, org: { orgId: "org-da-sessao", role: sessao.role } };
    }),
  };
});
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {};
    for (const m of ["order", "limit", "or"]) q[m] = () => q;
    q.eq = (...a: unknown[]) => {
      eq(...a);
      return q;
    };
    q.select = (cols: string) => {
      select(cols);
      return q;
    };
    q.then = (f: (v: unknown) => unknown) => f({ data: [], error: null });
    return { from: () => q };
  },
}));

const { GET, POST } = await import("./route");
const acao = await import("./[id]/[acao]/route");
const ID = "11111111-1111-4111-8111-111111111111";
const get = () => new NextRequest("http://localhost/api/v1/campaigns");
const post = (url = "http://localhost/api/v1/campaigns") =>
  new NextRequest(url, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });

describe("papéis das campanhas", () => {
  beforeEach(() => {
    select.mockClear();
    eq.mockClear();
    sessao.admin = false;
    sessao.role = null;
  });

  it("sem sessão: 401 (antes de 403)", async () => {
    expect((await GET(get())).status).toBe(401);
  });
  it("viewer GET: 403", async () => {
    sessao.role = "viewer";
    expect((await GET(get())).status).toBe(403);
  });
  it("agent GET: 200, sem a coluna passos", async () => {
    sessao.role = "agent";
    expect((await GET(get())).status).toBe(200);
    expect(select.mock.calls[0]?.[0]).not.toContain("passos");
    expect(eq).toHaveBeenCalledWith("organization_id", "org-da-sessao");
  });
  it("platform admin full (role de agent, sem membership) recebe passos", async () => {
    sessao.role = "agent";
    sessao.admin = true;
    expect((await GET(get())).status).toBe(200);
    expect(select.mock.calls[0]?.[0]).toContain("passos");
  });
  it("manager GET: 200, com passos", async () => {
    sessao.role = "manager";
    expect((await GET(get())).status).toBe(200);
    expect(select.mock.calls[0]?.[0]).toContain("passos");
  });
  it("controle negativo: agent POST e agent disparar: 403", async () => {
    sessao.role = "agent";
    expect((await POST(post())).status).toBe(403);
    const res = await acao.POST(post(`http://localhost/api/v1/campaigns/${ID}/disparar`), {
      params: Promise.resolve({ id: ID, acao: "disparar" }),
    });
    expect(res.status).toBe(403);
    expect(ROLE_RANK.agent).toBeLessThan(ROLE_RANK.manager);
  });
});
