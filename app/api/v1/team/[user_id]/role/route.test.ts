import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { avisarMudancaDeAcesso } from "@/lib/team/avisar-mudanca-de-acesso";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));
vi.mock("@/lib/team/avisar-mudanca-de-acesso", () => ({ avisarMudancaDeAcesso: vi.fn(async () => undefined) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const ALVO = "33333333-3333-4333-8333-333333333333";

function banco(membro: unknown) {
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membro, error: null }) }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as never);
}

const pedido = (role: string) =>
  new NextRequest("http://localhost/api/v1/team/x/role", { method: "PATCH", body: JSON.stringify({ role }) });
const ctx = { params: Promise.resolve({ user_id: ALVO }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: ADMIN, idioma: "pt-BR" },
    org: { orgId: ORG, role: "admin", name: "Acme" },
  } as never);
});

describe("trocar papel de membro", () => {
  it("avisa a pessoa uma vez, com o papel novo e o anterior", async () => {
    banco({ id: "m1", user_id: ALVO, role: "agent", revoked_at: null });
    const { PATCH } = await import("./route");
    const res = await PATCH(pedido("manager"), ctx);

    expect(res.status).toBe(200);
    expect(avisarMudancaDeAcesso).toHaveBeenCalledTimes(1);
    expect(avisarMudancaDeAcesso).toHaveBeenCalledWith(
      expect.objectContaining({
        mudanca: { tipo: "papel_alterado", papel: "manager", papelAnterior: "agent" },
        autorId: ADMIN,
        alvoId: ALVO,
        empresa: "Acme",
      }),
    );
  });

  it("não avisa quando o membro não existe, está revogado ou o corpo é inválido", async () => {
    const { PATCH } = await import("./route");
    banco(null);
    expect((await PATCH(pedido("manager"), ctx)).status).toBe(404);
    banco({ id: "m1", user_id: ALVO, role: "agent", revoked_at: "2026-09-10T12:00:00Z" });
    expect((await PATCH(pedido("manager"), ctx)).status).toBe(409);
    banco({ id: "m1", user_id: ALVO, role: "agent", revoked_at: null });
    expect((await PATCH(pedido("rei"), ctx)).status).toBeGreaterThanOrEqual(400);

    expect(avisarMudancaDeAcesso).not.toHaveBeenCalled();
  });
});
