import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

/**
 * REAGENDAR RE-ARMA O AVISO (migration 9043).
 *
 * O cron `task-due-reminder` só avisa tarefa com `reminded_at` nula. Se o
 * PATCH que muda o prazo não zerasse o carimbo, a tarefa que já apitou uma vez
 * ficaria muda no prazo novo — e "o responsável é avisado na hora" viraria
 * mentira na segunda vez. O inverso também importa: editar o título não pode
 * re-armar um aviso que já saiu, nem o corpo pode escrever `reminded_at`.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: () => true }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/tarefas/atividade", () => ({ registraAtividadeDaTarefa: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const TAREFA = "55555555-5555-4555-8555-555555555555";

let gravado: Record<string, unknown> | null;
/** O prazo gravado ANTES do PATCH (a tarefa já avisada). */
let prazoAntes: string | null;

function banco() {
  return {
    from: () => {
      const elo: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order", "limit"]) elo[m] = () => elo;
      elo.update = (m: Record<string, unknown>) => ((gravado = m), elo);
      elo.maybeSingle = async () => ({ data: { status: "pending", due_date: prazoAntes }, error: null });
      elo.single = async () => ({ data: { id: TAREFA, organization_id: ORG, status: "pending" }, error: null });
      return elo;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  gravado = null;
  prazoAntes = "2026-10-07T14:00:00.000Z";
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u", email: "a@x.com", full_name: "Ana", avatar_url: null, is_platform_admin: false, idioma: "pt-BR", organizations: [] },
    org: { orgId: ORG, name: "Org", role: "agent" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(banco() as never);
});

async function patch(dados: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/v1/tasks/[id]/route");
  return PATCH(
    new NextRequest(`http://x/api/v1/tasks/${TAREFA}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    }),
    { params: Promise.resolve({ id: TAREFA }) },
  );
}

describe("PATCH /api/v1/tasks/[id] — o carimbo do aviso", () => {
  it("⭐ mudar o prazo zera reminded_at", async () => {
    const res = await patch({ due_date: "2026-10-08T15:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(gravado).toEqual({ due_date: "2026-10-08T15:00:00.000Z", reminded_at: null });
  });

  it("reenviar o MESMO instante (outro formato) num PATCH de título não zera", async () => {
    await patch({ title: "Ligar", due_date: "2026-10-07T11:00:00-03:00" });
    expect(gravado).toEqual({ title: "Ligar", due_date: "2026-10-07T11:00:00-03:00" });
  });

  it("dar prazo a uma tarefa que não tinha zera (nulo para valor conta)", async () => {
    prazoAntes = null;
    await patch({ due_date: "2026-10-08T15:00:00.000Z" });
    expect(gravado).toEqual({ due_date: "2026-10-08T15:00:00.000Z", reminded_at: null });
  });

  it("tirar o prazo também zera (a tarefa sem prazo sai da varredura de qualquer jeito)", async () => {
    await patch({ due_date: null });
    expect(gravado).toEqual({ due_date: null, reminded_at: null });
  });

  it("editar só o título de tarefa já avisada não re-arma o aviso", async () => {
    await patch({ title: "Ligar de novo" });
    expect(gravado).toEqual({ title: "Ligar de novo" });
  });

  it("o corpo não escreve reminded_at", async () => {
    await patch({ title: "X", reminded_at: "2030-01-01T00:00:00.000Z" });
    expect(gravado).toEqual({ title: "X" });
  });
});
