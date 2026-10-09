import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";
import { TETO_DE_FIXADAS } from "@/lib/inbox/estado-por-atendente";
import { createClient } from "@/lib/supabase/server";

import * as markUnread from "@/app/api/v1/conversations/[id]/mark-unread/route";
import * as mute from "@/app/api/v1/conversations/[id]/mute/route";
import * as pin from "@/app/api/v1/conversations/[id]/pin/route";

/**
 * As rotas de estado POR ATENDENTE (migration 9042): `pin`, `mute` e
 * `mark-unread`. O falso banco registra o que cada rota mandou: a autorização
 * se prova pelo que NÃO chegou ao banco.
 */

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";

let visivel = true;
let fixadas = 0;
const selecoes: string[] = [];
const escritas: Array<{ op: string; valores: Record<string, unknown>; filtros: Record<string, unknown> }> = [];

function falsoBanco() {
  return {
    from: (tabela: string) => {
      const filtros: Record<string, unknown> = {};
      let op = "select";
      let valores: Record<string, unknown> = {};
      const q = {
        select: (cols?: string) => (tabela === "conversation_user_state" && cols && selecoes.push(cols), q),
        eq: (k: string, v: unknown) => ((filtros[k] = v), q),
        neq: () => q,
        not: () => q,
        maybeSingle: async () => ({ data: tabela === "conversations" && visivel ? { id: CONVERSA } : null, error: null }),
        upsert: async (v: Record<string, unknown>) => {
          escritas.push({ op: "upsert", valores: v, filtros });
          return { error: null };
        },
        update: (v: Record<string, unknown>) => ((op = "update"), (valores = v), q),
        delete: () => ((op = "delete"), q),
        then: (resolve: (r: unknown) => void) => {
          if (op === "update" || op === "delete") escritas.push({ op, valores, filtros });
          resolve({ count: fixadas, error: null, data: null });
        },
      };
      return q;
    },
  };
}

const ctx = (id = CONVERSA) => ({ params: Promise.resolve({ id }) });
const req = (corpo?: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });

beforeEach(() => {
  vi.clearAllMocks();
  visivel = true;
  fixadas = 0;
  escritas.length = 0;
  selecoes.length = 0;
  vi.mocked(loadAuthUser).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: EU, idioma: "pt-BR" },
    org: { orgId: ORG, role: "viewer" },
  } as Awaited<ReturnType<typeof requireRole>>);
  vi.mocked(createClient).mockResolvedValue(falsoBanco() as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("autorização (as três rotas, POST e DELETE)", () => {
  const handlers = [
    ["pin POST", () => pin.POST(req(), ctx())],
    ["pin DELETE", () => pin.DELETE(req(), ctx())],
    ["mute POST", () => mute.POST(req({ duracao: "8h" }), ctx())],
    ["mute DELETE", () => mute.DELETE(req(), ctx())],
    ["mark-unread POST", () => markUnread.POST(req(), ctx())],
    ["mark-unread DELETE", () => markUnread.DELETE(req(), ctx())],
  ] as const;

  for (const [nome, chamar] of handlers) {
    it(`${nome}: papel mínimo VIEWER (preferência pessoal)`, async () => {
      const r = await chamar();
      expect(r.status).toBe(200);
      expect(requireRole).toHaveBeenCalledWith("viewer", expect.objectContaining({ resource: "conversations" }));
    });

    it(`${nome}: suporte somente leitura → 403 sem tocar o banco`, async () => {
      vi.mocked(loadAuthUser).mockResolvedValue({
        id: EU,
        support: { organization_id: ORG, status: "active", access_mode: "support_readonly" },
      } as Awaited<ReturnType<typeof loadAuthUser>>);
      const r = await chamar();
      expect(r.status).toBe(403);
      expect(createClient).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });
  }

  it("sem sessão (requireRole nega) → a resposta dele, sem banco", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: fail("unauthenticated", "x", 401) });
    expect((await pin.POST(req(), ctx())).status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("conversa que a pessoa não enxerga (ou de outra org) → 404, nada gravado", async () => {
    visivel = false;
    expect((await pin.POST(req(), ctx())).status).toBe(404);
    expect(escritas).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("id fora do formato → 422", async () => {
    expect((await mute.POST(req({ duracao: "8h" }), ctx("nao-e-uuid"))).status).toBe(422);
  });
});

describe("o que cada rota grava", () => {
  it("pin POST: upsert com a org e o usuário DA SESSÃO, só pinned_at", async () => {
    await pin.POST(req(), ctx());
    const [e] = escritas;
    expect(e?.op).toBe("upsert");
    expect(e?.valores).toMatchObject({ organization_id: ORG, user_id: EU, conversation_id: CONVERSA });
    expect(typeof e?.valores.pinned_at).toBe("string");
    expect(e?.valores).not.toHaveProperty("muted_until");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "conversation.pinned", resourceId: CONVERSA }));
  });

  it(`pin POST: no teto (${TETO_DE_FIXADAS}) → 409, nada gravado`, async () => {
    fixadas = TETO_DE_FIXADAS;
    expect((await pin.POST(req(), ctx())).status).toBe(409);
    expect(escritas).toHaveLength(0);
  });

  it("pin DELETE: UPDATE (nunca upsert) zerando pinned_at, filtrado pelo usuário da sessão", async () => {
    await pin.DELETE(req(), ctx());
    const [e] = escritas;
    expect(e?.op).toBe("update");
    expect(e?.valores).toMatchObject({ pinned_at: null });
    expect(e?.filtros).toMatchObject({ user_id: EU, organization_id: ORG, conversation_id: CONVERSA });
  });

  it("mute POST: 'sempre' grava 'infinity'; 8h grava um instante ~8h à frente", async () => {
    await mute.POST(req({ duracao: "sempre" }), ctx());
    expect(escritas[0]?.valores.muted_until).toBe("infinity");
    const antes = Date.now();
    await mute.POST(req({ duracao: "8h" }), ctx());
    const ate = Date.parse(String(escritas[1]?.valores.muted_until));
    expect(ate - antes).toBeGreaterThan(8 * 3_600_000 - 5_000);
    expect(ate - antes).toBeLessThan(8 * 3_600_000 + 5_000);
  });

  it("mute POST: duração fora da lista, corpo vazio ou campo estranho → 422", async () => {
    for (const corpo of [{ duracao: "3h" }, undefined, { duracao: "8h", muted_until: "infinity" }]) {
      expect((await mute.POST(req(corpo), ctx())).status).toBe(422);
    }
    expect(escritas).toHaveLength(0);
  });

  it("mark-unread POST/DELETE: marca e desmarca só para quem pede", async () => {
    await markUnread.POST(req(), ctx());
    await markUnread.DELETE(req(), ctx());
    expect(escritas[0]).toMatchObject({ op: "upsert", valores: { user_id: EU } });
    expect(escritas[1]).toMatchObject({ op: "update", valores: { marked_unread_at: null } });
    expect(vi.mocked(audit).mock.calls.map((c) => c[0].action)).toEqual([
      "conversation.marked_unread",
      "conversation.unmarked_unread",
    ]);
  });
});

describe("vaga presa (revisão do Cassio)", () => {
  it("o teto conta só fixadas que a pessoa ainda ENXERGA (inner com conversations, sob a RLS dela)", async () => {
    await pin.POST(req(), ctx());
    expect(selecoes.some((c) => c.includes("conversations!inner"))).toBe(true);
  });

  for (const [nome, chamar] of [
    ["pin", () => pin.DELETE(req(), ctx())],
    ["mute", () => mute.DELETE(req(), ctx())],
    ["mark-unread", () => markUnread.DELETE(req(), ctx())],
  ] as const) {
    it(`${nome} DELETE em conversa fora da visão: apaga a PRÓPRIA linha (200), recortada pela sessão`, async () => {
      visivel = false;
      expect((await chamar()).status).toBe(200);
      expect(escritas[0]).toMatchObject({
        op: "delete",
        filtros: { user_id: EU, organization_id: ORG, conversation_id: CONVERSA },
      });
    });
  }

  it("CONTROLE: POST em conversa fora da visão continua 404", async () => {
    visivel = false;
    expect((await mute.POST(req({ duracao: "8h" }), ctx())).status).toBe(404);
    expect(escritas).toHaveLength(0);
  });
});
