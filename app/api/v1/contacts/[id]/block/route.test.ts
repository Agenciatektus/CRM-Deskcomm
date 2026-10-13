import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const org = "11111111-1111-4111-8111-111111111111";
const contato = "22222222-2222-4222-8222-222222222222";
const outroContato = "33333333-3333-4333-8333-333333333333";

const filters: Record<string, unknown> = {};
let patchEnviado: Record<string, unknown> | null = null;
/** O contato no falso banco: `is_blocked` decide se o UPDATE condicional casa. */
let jaBloqueado = false;

const contexto = (id = contato) => ({ params: Promise.resolve({ id }) });
const req = (corpo?: unknown) =>
  new NextRequest(`http://localhost/api/v1/contacts/${contato}/block`, {
    method: "POST",
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(filters)) delete filters[k];
  patchEnviado = null;
  jaBloqueado = false;
  vi.mocked(loadAuthUser).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: org },
    org: { orgId: org, role: "agent" },
  } as Awaited<ReturnType<typeof requireRole>>);
  const nova = () => {
    let ehUpdate = false;
    const q = {
      update: (valores: Record<string, unknown>) => {
        patchEnviado = valores;
        ehUpdate = true;
        return q;
      },
      eq: (k: string, v: unknown) => {
        filters[k] = v;
        return q;
      },
      select: () => q,
      maybeSingle: async () => {
        const casa = filters["id"] === contato && filters["organization_id"] === org;
        if (!casa) return { data: null, error: null };
        if (ehUpdate) {
          // O UPDATE condicional só casa quem ainda NÃO está bloqueado.
          if (filters["is_blocked"] !== false || jaBloqueado) return { data: null, error: null };
          return { data: { id: contato, ...patchEnviado }, error: null };
        }
        return { data: { id: contato, is_blocked: jaBloqueado, blocked_reason: jaBloqueado ? "stop_keyword" : null }, error: null };
      },
    };
    return q;
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => nova() } as unknown as ReturnType<typeof createAdminClient>);
});

describe("bloquear contato pela equipe (simétrico do /unblock)", () => {
  it("exige AGENT, e negado não toca o banco nem audita", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: fail("forbidden", "Acesso negado.", 403) });
    const r = await POST(req(), contexto());
    expect(r.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("agent", expect.objectContaining({ resource: "contacts" }));
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("suporte somente leitura nega antes do service role", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({
      id: org,
      is_platform_admin: true,
      support: { organization_id: org, status: "active", access_mode: "support_readonly" },
    } as Awaited<ReturnType<typeof loadAuthUser>>);
    const r = await POST(req(), contexto());
    expect(r.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("grava a MESMA coluna que o /unblock desfaz; sem motivo, `manual`", async () => {
    const r = await POST(req(), contexto());
    expect(r.status).toBe(200);
    expect(patchEnviado).toMatchObject({ is_blocked: true, blocked_reason: "manual" });
    expect(typeof patchEnviado?.blocked_at).toBe("string");
  });

  it("com motivo, o motivo aparado vai para blocked_reason; a auditoria registra só QUE houve motivo", async () => {
    await POST(req({ motivo: "  pediu para sair  " }), contexto());
    expect(patchEnviado).toMatchObject({ blocked_reason: "pediu para sair" });
    const meta = vi.mocked(audit).mock.calls[0]?.[0]?.metadata ?? {};
    expect(meta).toMatchObject({ com_motivo: true, origem: "equipe" });
    expect(JSON.stringify(meta)).not.toContain("pediu para sair");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contact.blocked", resourceId: contato }));
  });

  it("motivo longo demais ou campo estranho → 422, sem tocar o banco", async () => {
    expect((await POST(req({ motivo: "x".repeat(281) }), contexto())).status).toBe(422);
    expect((await POST(req({ is_blocked: false }), contexto())).status).toBe(422);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("id de outra organização → 404; id fora do formato → 422", async () => {
    expect((await POST(req(), contexto(outroContato))).status).toBe(404);
    expect(filters["organization_id"]).toBe(org);
    expect((await POST(req(), contexto("nao-e-uuid"))).status).toBe(422);
  });

  it("contato JÁ bloqueado (ex.: stop_keyword): 200 idempotente, o motivo original fica, e não audita de novo", async () => {
    jaBloqueado = true;
    const r = await POST(req({ motivo: "outro motivo" }), contexto());
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { data: { blocked_reason: string } };
    expect(corpo.data.blocked_reason).toBe("stop_keyword");
    // O UPDATE foi condicional a `is_blocked = false`: no banco, não casou nada.
    expect(filters["is_blocked"]).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });
});
