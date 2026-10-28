/**
 * PATCH do lead: só uma TROCA real de dono humano aciona o helper que move a
 * conversa. Reenviar o dono atual (o formulário manda tudo) não chama; dono novo
 * chama 1 vez, com o contact_id do lead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => undefined),
  isServiceRoleConfigured: vi.fn(() => false),
}));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
  stageChangeReason: () => "movido",
}));
vi.mock("@/lib/leads/activity-write-failure", () => ({
  registraFalhaDeAtividade: vi.fn(async () => undefined),
}));
vi.mock("@/lib/atendimento/origem", () => ({
  observeServiceOrigin: vi.fn(async () => null),
}));
vi.mock("@/lib/leads/acompanhar-dono-na-conversa", () => ({
  acompanharDonoNaConversa: vi.fn(async () => 0),
}));
vi.mock("@/lib/supabase/admin", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: { role: "agent" }, error: null });
  return { createAdminClient: vi.fn(() => ({ from: () => q, rpc: vi.fn(async () => ({ error: null })) })) };
});

import { updateLeadHandler } from "@/app/api/v1/leads/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { acompanharDonoNaConversa } from "@/lib/leads/acompanhar-dono-na-conversa";

const ORG = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const CONTATO = "44444444-4444-4444-8444-444444444444";
const ATUAL = "55555555-5555-4555-8555-555555555555";
const NOVO = "66666666-6666-4666-8666-666666666666";

function banco() {
  const lead = {
    id: LEAD, organization_id: ORG, contact_id: CONTATO, title: "t", tags: [], custom_fields: {},
    owner_user_id: ATUAL, updated_at: "2026-09-15T12:00:00.000Z",
  };
  return {
    from: (tabela: string) => {
      if (tabela !== "crm_leads") {
        // consultas laterais (ex.: contato pessoal): nada encontrado
        const l: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "in", "limit"]) l[m] = () => l;
        l.maybeSingle = async () => ({ data: null, error: null });
        return l;
      }
      return {
        select: () => {
          const l: Record<string, unknown> = {};
          l.eq = () => l;
          l.maybeSingle = async () => ({ data: lead, error: null });
          return l;
        },
        update: (v: Record<string, unknown>) => {
          const e: Record<string, unknown> = {};
          e.eq = () => e;
          e.select = () => e;
          e.maybeSingle = async () => ({ data: { ...lead, ...v }, error: null });
          return e;
        },
      };
    },
    rpc: () => ({ then: (fn: (r: { error: null }) => void) => Promise.resolve(fn({ error: null })) }),
  };
}

const ctx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: "11111111-1111-4111-8111-111111111111" },
  requestId: "req-1",
  idioma: "pt-BR",
};

beforeEach(() => vi.clearAllMocks());

describe("updateLeadHandler: dono do lead e conversa do contato", () => {
  it("reenviar o dono atual não chama o helper", async () => {
    await updateLeadHandler(banco() as never, ctx, LEAD, { owner_user_id: ATUAL });
    expect(acompanharDonoNaConversa).not.toHaveBeenCalled();
  });

  it("dono diferente chama 1 vez, com o contact_id do lead", async () => {
    await updateLeadHandler(banco() as never, ctx, LEAD, { owner_user_id: NOVO });
    expect(acompanharDonoNaConversa).toHaveBeenCalledTimes(1);
    expect(acompanharDonoNaConversa).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG, contactIds: [CONTATO], novoDonoUserId: NOVO }),
    );
  });
});
