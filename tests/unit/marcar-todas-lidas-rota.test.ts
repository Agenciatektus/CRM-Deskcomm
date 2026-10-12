/** A rota do lote: papel, suporte somente leitura e auditoria. Regras em `marcar-todas-lidas.test.ts`. */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("rota POST /conversations/mark-all-read", () => {
  const mocks = vi.hoisted(() => ({ suporte: vi.fn(), papel: vi.fn(), auditar: vi.fn(), lote: vi.fn() }));
  vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.suporte }));
  vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.papel }));
  vi.mock("@/lib/audit", () => ({ audit: mocks.auditar }));
  vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
  vi.mock("@/lib/inbox/marcar-todas-lidas", async (original) => ({
    ...(await original<typeof import("@/lib/inbox/marcar-todas-lidas")>()),
    marcarTodasComoLidas: mocks.lote,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.suporte.mockResolvedValue(null);
    mocks.papel.mockResolvedValue({ ok: true, org: { orgId: "org-1" }, user: { id: "user-1" } });
    mocks.lote.mockResolvedValue({ contadores: 2, marcas: 1 });
  });

  it("exige agent, recusa suporte somente leitura e audita o lote", async () => {
    const { POST } = await import("@/app/api/v1/conversations/mark-all-read/route");
    const resposta = await POST();
    expect(resposta.status).toBe(200);
    expect(mocks.papel).toHaveBeenCalledWith("agent", expect.anything());
    expect(mocks.lote).toHaveBeenCalledWith(expect.anything(), { orgId: "org-1", userId: "user-1" });
    expect(mocks.auditar).toHaveBeenCalledWith(
      expect.objectContaining({ action: "conversation.all_marked_read", organizationId: "org-1", actorUserId: "user-1" }),
    );
  });

  it("suporte somente leitura não chega ao lote", async () => {
    mocks.suporte.mockResolvedValue(new Response(null, { status: 403 }));
    const { POST } = await import("@/app/api/v1/conversations/mark-all-read/route");
    expect((await POST()).status).toBe(403);
    expect(mocks.lote).not.toHaveBeenCalled();
  });
});
