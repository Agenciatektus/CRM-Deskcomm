import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { FOLGA_DO_PRAZO_MS, prazoNoPassado } from "@/lib/tarefas/prazo-no-passado";

/**
 * Segunda camada do limite do prazo (P2 de backend do Cassio na #171): a rota
 * de tarefas recusa prazo no passado, com folga de 5 minutos, em 422 e com a
 * mensagem traduzida. Tarefa concluída ou cancelada pode registrar o passado, e
 * reenviar o MESMO prazo (PATCH de título numa tarefa atrasada) continua valendo.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: () => true }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/tarefas/atividade", () => ({ registraAtividadeDaTarefa: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const TAREFA = "55555555-5555-4555-8555-555555555555";
const AGORA = new Date("2026-10-12T12:00:00Z");
const ONTEM = "2026-10-11T12:00:00.000Z";
const AMANHA = "2026-10-13T12:00:00.000Z";

let gravou: boolean;
let antes: { status: string; due_date: string | null };

function banco() {
  return {
    from: () => {
      const elo: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order", "limit"]) elo[m] = () => elo;
      elo.update = () => ((gravou = true), elo);
      elo.insert = () => ((gravou = true), elo);
      elo.maybeSingle = async () => ({ data: antes, error: null });
      elo.single = async () => ({ data: { id: TAREFA, organization_id: ORG, status: "pending" }, error: null });
      return elo;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: AGORA });
  vi.clearAllMocks();
  gravou = false;
  antes = { status: "pending", due_date: ONTEM };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u", email: "a@x.com", full_name: "Ana", avatar_url: null, is_platform_admin: false, idioma: "es", organizations: [] },
    org: { orgId: ORG, name: "Org", role: "agent" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(banco() as never);
});

afterEach(() => {
  vi.useRealTimers();
});

const pedido = (metodo: string, url: string, dados: Record<string, unknown>) =>
  new NextRequest(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });

async function criar(dados: Record<string, unknown>) {
  const { POST } = await import("@/app/api/v1/tasks/route");
  return POST(pedido("POST", "http://x/api/v1/tasks", { title: "Ligar", ...dados }));
}

async function editar(dados: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/v1/tasks/[id]/route");
  return PATCH(pedido("PATCH", `http://x/api/v1/tasks/${TAREFA}`, dados), { params: Promise.resolve({ id: TAREFA }) });
}

describe("prazoNoPassado", () => {
  it("passado além da folga é recusado; dentro da folga e futuro, não", () => {
    expect(prazoNoPassado(ONTEM, "pending", AGORA)).toBe(true);
    expect(prazoNoPassado(new Date(AGORA.getTime() - FOLGA_DO_PRAZO_MS + 1_000).toISOString(), "pending", AGORA)).toBe(false);
    expect(prazoNoPassado(new Date(AGORA.getTime() - FOLGA_DO_PRAZO_MS - 1_000).toISOString(), "pending", AGORA)).toBe(true);
    expect(prazoNoPassado(AMANHA, "pending", AGORA)).toBe(false);
    expect(prazoNoPassado(null, "pending", AGORA)).toBe(false);
  });

  it("concluída e cancelada registram o passado", () => {
    expect(prazoNoPassado(ONTEM, "done", AGORA)).toBe(false);
    expect(prazoNoPassado(ONTEM, "cancelled", AGORA)).toBe(false);
  });
});

describe("POST /api/v1/tasks", () => {
  it("prazo no passado: 422, mensagem traduzida e nada gravado", async () => {
    const res = await criar({ due_date: ONTEM });
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string; details?: { campo?: string } } };
    expect(corpo.error.message).toBe("El plazo de la tarea no puede estar en el pasado.");
    expect(corpo.error.details?.campo).toBe("due_date");
    expect(gravou).toBe(false);
  });

  it("CONTROLE: prazo futuro cria (201)", async () => {
    const res = await criar({ due_date: AMANHA });
    expect(res.status).toBe(201);
    expect(gravou).toBe(true);
  });

  it("tarefa já concluída com prazo no passado é registro e cria", async () => {
    const res = await criar({ due_date: ONTEM, status: "done" });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/v1/tasks/[id]", () => {
  it("mudar o prazo para o passado: 422 e nada gravado", async () => {
    antes = { status: "pending", due_date: AMANHA };
    const res = await editar({ due_date: ONTEM });
    expect(res.status).toBe(422);
    expect(gravou).toBe(false);
  });

  it("reenviar o MESMO prazo atrasado (edição do título) continua valendo", async () => {
    const res = await editar({ title: "Ligar de novo", due_date: ONTEM });
    expect(res.status).toBe(200);
    expect(gravou).toBe(true);
  });

  it("CONTROLE: mudar o prazo para o futuro grava", async () => {
    const res = await editar({ due_date: AMANHA });
    expect(res.status).toBe(200);
    expect(gravou).toBe(true);
  });
});
