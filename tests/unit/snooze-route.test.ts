import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/conversations/[id]/snooze, depois da forma `snooze_until`
 * (cabeçalho do chat, visual v2).
 *
 * O que se mede: o instante exato só passa se for futuro, dentro de 90 dias e
 * com fuso; as duas formas juntas são recusadas; o tenant vem da sessão (linha
 * de outra org = 404, sem audit); suporte somente leitura é barrado antes de
 * qualquer escrita; e o caminho feliz grava e audita nos dois formatos.
 * Relógio falso só no `Date`, para "passado" e "90 dias" não dependerem da hora.
 */

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const AGORA = new Date("2026-10-06T17:00:00.000Z");

let atualizacao: Record<string, unknown> | null = null;
let filtros: Record<string, unknown> = {};
/** `null` simula conversa de outra org: a RLS/filtro não devolve linha. */
let linha: { id: string } | null = null;

function pedido(corpo: unknown): NextRequest {
  return new NextRequest(`https://crm.exemplo/api/v1/conversations/${CONVERSA}/snooze`, {
    method: "POST",
    body: JSON.stringify(corpo),
  });
}

async function postar(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/conversations/[id]/snooze/route");
  return POST(pedido(corpo), { params: Promise.resolve({ id: CONVERSA }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  atualizacao = null;
  filtros = {};
  linha = { id: CONVERSA };
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: ANA, idioma: "pt-BR" } as never,
    org: { orgId: ORG } as never,
  });
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      update: (valores: Record<string, unknown>) => {
        atualizacao = valores;
        const cadeia = {
          eq: (coluna: string, valor: unknown) => {
            filtros[coluna] = valor;
            return cadeia;
          },
          select: () => cadeia,
          maybeSingle: async () => ({ data: linha, error: null }),
        };
        return cadeia;
      },
    }),
  } as never);
});
afterEach(() => vi.useRealTimers());

describe("POST snooze: caminho feliz", () => {
  it("snooze_until grava exatamente o instante pedido e audita com ele", async () => {
    const r = await postar({ snooze_until: "2026-10-07T12:00:00.000Z" });
    expect(r.status).toBe(200);
    expect(atualizacao).toMatchObject({ snooze_until: "2026-10-07T12:00:00.000Z", snoozed_by_user_id: ANA });
    expect(filtros).toMatchObject({ id: CONVERSA, organization_id: ORG });
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({
      action: "conversation.snoozed",
      organizationId: ORG,
      metadata: { snooze_until: "2026-10-07T12:00:00.000Z" },
    });
  });

  it("duration_hours (contrato antigo) continua valendo", async () => {
    const r = await postar({ duration_hours: 3 });
    expect(r.status).toBe(200);
    expect(atualizacao?.snooze_until).toBe("2026-10-06T20:00:00.000Z");
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ metadata: { duration_hours: 3 } });
  });

  it("instante com fuso -03:00 é aceito e normalizado para UTC", async () => {
    const r = await postar({ snooze_until: "2026-10-07T09:00:00-03:00" });
    expect(r.status).toBe(200);
    expect(atualizacao?.snooze_until).toBe("2026-10-07T12:00:00.000Z");
  });
});

describe("POST snooze: recusas, todas sem escrita e sem audit", () => {
  it.each([
    ["no passado", { snooze_until: "2026-10-06T16:59:00.000Z" }],
    ["agora em ponto", { snooze_until: AGORA.toISOString() }],
    ["além de 90 dias", { snooze_until: "2027-01-05T17:00:01.000Z" }],
    ["sem fuso", { snooze_until: "2026-10-07T09:00:00" }],
    ["as duas formas juntas", { duration_hours: 1, snooze_until: "2026-10-07T12:00:00.000Z" }],
    ["corpo vazio", {}],
  ])("%s → 422", async (_nome, corpo) => {
    const r = await postar(corpo);
    expect(r.status).toBe(422);
    expect(atualizacao).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("conversa de outra org → 404, sem audit (o tenant vem da sessão)", async () => {
    linha = null;
    const r = await postar({ snooze_until: "2026-10-07T12:00:00.000Z" });
    expect(r.status).toBe(404);
    expect(filtros.organization_id).toBe(ORG);
    expect(audit).not.toHaveBeenCalled();
  });

  it("suporte somente leitura é barrado antes de qualquer coisa", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValue(new Response(null, { status: 403 }) as never);
    const r = await postar({ snooze_until: "2026-10-07T12:00:00.000Z" });
    expect(r.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(atualizacao).toBeNull();
  });
});
