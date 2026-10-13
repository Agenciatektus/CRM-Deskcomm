import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * A TAREFA SÓ SE PRENDE AO QUE É DA ORGANIZAÇÃO (revisão do @Cassio_SecRev, P2).
 *
 * `lead_id`, `contact_id` e `assigned_to` de `crm_tasks` são FKs simples, e a
 * checagem de FK do Postgres não passa por RLS: ela aceita o uuid de QUALQUER
 * organização. Sem a leitura que `recusaDeVinculoDaTarefa` faz, um `agent`
 * gravava tarefa no contato ou no negócio de outra organização, ou atribuía a
 * qualquer usuário do `auth.users`.
 *
 * O dublê do banco só devolve linha quando o filtro de `organization_id` é o da
 * SESSÃO: se a rota deixasse de filtrar, o caso de outra org passaria a achar a
 * linha e a gravar, e o teste ficaria vermelho.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: () => true }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn(async () => ({ ok: true })) }));
// As duas rotas só usam o guarda de escrita de suporte; a autoridade de suporte
// tem suíte própria.
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const ANA = "11111111-1111-4111-8111-111111111111";
const ESTRANHO = "66666666-6666-4666-8666-666666666666";
const VIEWER = "88888888-8888-4888-8888-888888888888";
const LEAD = "44444444-4444-4444-8444-444444444444";
const LEAD_ALHEIO = "44444444-4444-4444-8444-000000000000";
const CONTATO = "77777777-7777-4777-8777-777777777777";
const CONTATO_ALHEIO = "77777777-7777-4777-8777-000000000000";
const TAREFA = "55555555-5555-4555-8555-555555555555";

/** As linhas do "banco", cada uma com a organização a que pertence. */
const LINHAS: Record<string, Array<Record<string, unknown>>> = {
  crm_leads: [{ id: LEAD, organization_id: ORG }, { id: LEAD_ALHEIO, organization_id: OUTRA }],
  contacts: [{ id: CONTATO, organization_id: ORG }, { id: CONTATO_ALHEIO, organization_id: OUTRA }],
  user_organizations: [
    { user_id: ANA, organization_id: ORG, revoked_at: null, role: "agent" },
    { user_id: VIEWER, organization_id: ORG, revoked_at: null, role: "viewer" },
    { user_id: ESTRANHO, organization_id: OUTRA, revoked_at: null, role: "agent" },
  ],
};

const TAREFA_GRAVADA = {
  id: TAREFA, organization_id: ORG, title: "Ligar", description: null, due_date: null, priority: "medium",
  status: "pending", lead_id: null, contact_id: null, assigned_to: null, created_by: ANA,
  created_at: "2026-10-06T10:00:00Z", updated_at: "2026-10-06T10:00:00Z",
};

let escritas: string[] = [];

function banco() {
  return {
    from: (tabela: string) => {
      const filtros: Array<[string, unknown]> = [];
      const exclusoes: Array<[string, unknown]> = [];
      let escrita = false;
      const casa = () =>
        (LINHAS[tabela] ?? []).find(
          (l) => filtros.every(([c, v]) => (l[c] ?? null) === v) && exclusoes.every(([c, v]) => l[c] !== v),
        ) ?? null;
      const elo: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) elo[m] = () => elo;
      for (const m of ["insert", "update"]) elo[m] = () => ((escrita = true), escritas.push(tabela), elo);
      elo.eq = (c: string, v: unknown) => (filtros.push([c, v]), elo);
      elo.is = (c: string, v: unknown) => (filtros.push([c, v]), elo);
      elo.neq = (c: string, v: unknown) => (exclusoes.push([c, v]), elo);
      const resolve = () =>
        Promise.resolve({
          data: tabela === "crm_tasks" ? (escrita ? TAREFA_GRAVADA : { status: "pending" }) : casa(),
          error: null,
        });
      elo.single = resolve;
      elo.maybeSingle = resolve;
      return elo;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  escritas = [];
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: ANA, email: "a@x.com", full_name: "Ana", avatar_url: null, is_platform_admin: false, idioma: "pt-BR", organizations: [] },
    org: { orgId: ORG, name: "Org", role: "agent" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(banco() as never);
  vi.mocked(createAdminClient).mockReturnValue(banco() as never);
});

function corpo(metodo: "POST" | "PATCH", dados: Record<string, unknown>) {
  return new NextRequest(`http://x/api/v1/tasks${metodo === "PATCH" ? `/${TAREFA}` : ""}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
}

async function chama(metodo: "POST" | "PATCH", dados: Record<string, unknown>) {
  if (metodo === "POST") {
    const { POST } = await import("@/app/api/v1/tasks/route");
    return POST(corpo("POST", { title: "Ligar", ...dados }));
  }
  const { PATCH } = await import("@/app/api/v1/tasks/[id]/route");
  return PATCH(corpo("PATCH", dados), { params: Promise.resolve({ id: TAREFA }) });
}

describe.each(["POST", "PATCH"] as const)("%s /api/v1/tasks — vínculos da organização", (metodo) => {
  it.each([
    ["contato de outra organização", { contact_id: CONTATO_ALHEIO }, "contact_id"],
    ["negócio de outra organização", { lead_id: LEAD_ALHEIO }, "lead_id"],
    ["responsável que não é membro da organização", { assigned_to: ESTRANHO }, "assigned_to"],
    // Mesma régua do `/team/assignable`: viewer da PRÓPRIA org também não serve.
    ["responsável viewer da própria organização", { assigned_to: VIEWER }, "assigned_to"],
  ])("%s: 422 nomeando o campo, e nada é gravado", async (_nome, dados, campo) => {
    const res = await chama(metodo, dados);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: { code: string; details?: { campo?: string } } };
    expect(json.error.code).toBe("validation_failed");
    expect(json.error.details?.campo).toBe(campo);
    expect(escritas).toEqual([]);
  });

  it("caminho feliz: contato, negócio e responsável da org gravam", async () => {
    const res = await chama(metodo, { contact_id: CONTATO, lead_id: LEAD, assigned_to: ANA });
    expect(res.status).toBe(metodo === "POST" ? 201 : 200);
    expect(escritas).toEqual(["crm_tasks"]);
  });
});
