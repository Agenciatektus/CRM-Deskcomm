/**
 * O FILTRO `assigned_to` DE `GET /api/v1/tasks` (o "Minhas" do celular, M3.2), com as
 * regras do Cassio:
 *  - aceita "eu" ou o id de um membro da organização;
 *  - id de fora devolve a lista vazia, a MESMA resposta de um membro sem tarefas
 *    (não diz se o id existe em outro lugar);
 *  - só estreita a consulta: mesma org, mesmo papel mínimo, mesmo limite de página.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const BRUNO = "66666666-6666-4666-8666-666666666666";
const ESTRANHO = "77777777-7777-4777-8777-777777777777";

const papelMinimo = vi.hoisted(() => [] as Role[]);

function sessao(papel: Role) {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) => {
    papelMinimo.push(min);
    return ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) };
  });
}

/** Dublê do PostgREST que anota, por tabela, os filtros e o limite pedidos. */
function fazerSupabase(membros: string[]) {
  const chamadas: Array<{ tabela: string; filtros: Array<[string, unknown]>; limite?: number }> = [];
  const from = (tabela: string) => {
    const registro: (typeof chamadas)[number] = { tabela, filtros: [] };
    chamadas.push(registro);
    const elo: Record<string, unknown> = {};
    for (const m of ["select", "order", "in", "gte", "lte", "is"]) elo[m] = () => elo;
    elo.eq = (coluna: string, valor: unknown) => {
      registro.filtros.push([coluna, valor]);
      return elo;
    };
    elo.limit = (n: number) => {
      registro.limite = n;
      return elo;
    };
    elo.maybeSingle = async () => {
      const id = registro.filtros.find(([c]) => c === "user_id")?.[1];
      const daOrg = registro.filtros.some(([c, v]) => c === "organization_id" && v === ORG);
      return { data: daOrg && membros.includes(id as string) ? { user_id: id } : null, error: null };
    };
    elo.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "t-1" }], error: null }).then(res);
    return elo;
  };
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  return chamadas;
}

async function listar(qs: string) {
  const { GET } = await import("@/app/api/v1/tasks/route");
  const res = await GET(new NextRequest(`http://x/api/v1/tasks?${qs}`));
  return { status: res.status, corpo: (await res.json()) as { data?: { tasks: unknown[] } } };
}

const daLista = (chamadas: ReturnType<typeof fazerSupabase>) => chamadas.find((c) => c.tabela === "crm_tasks");

beforeEach(() => {
  vi.clearAllMocks();
  papelMinimo.length = 0;
  sessao("viewer");
});

describe("GET /api/v1/tasks?assigned_to=", () => {
  it('"eu" vira o usuário da SESSÃO, sem consultar membros, com org e limite mantidos', async () => {
    const chamadas = fazerSupabase([ANA]);
    const { status } = await listar("assigned_to=eu&aberto=true");
    expect(status).toBe(200);
    expect(chamadas.map((c) => c.tabela)).toEqual(["crm_tasks"]);
    const lista = daLista(chamadas)!;
    expect(lista.filtros).toContainEqual(["assigned_to", ANA]);
    expect(lista.filtros).toContainEqual(["organization_id", ORG]);
    expect(lista.limite).toBe(500);
  });

  it("⭐ agent filtrando por COLEGA: filtra por ele sem ler a filiação (que a RLS esconde do agent)", async () => {
    sessao("agent");
    const chamadas = fazerSupabase([]);
    const { status, corpo } = await listar(`assigned_to=${BRUNO}`);
    expect(status).toBe(200);
    expect(corpo.data).toEqual({ tasks: [{ id: "t-1" }] });
    expect(chamadas.map((c) => c.tabela)).toEqual(["crm_tasks"]);
    const lista = daLista(chamadas)!;
    expect(lista.filtros).toContainEqual(["assigned_to", BRUNO]);
    expect(lista.filtros).toContainEqual(["organization_id", ORG]);
    expect(lista.limite).toBe(500);
  });

  it("id de fora só estreita a lista da org da sessão: nada além do que a RLS já mostra", async () => {
    const chamadas = fazerSupabase([]);
    await listar(`assigned_to=${ESTRANHO}`);
    const lista = daLista(chamadas)!;
    expect(lista.filtros).toContainEqual(["organization_id", ORG]);
    expect(lista.filtros).toContainEqual(["assigned_to", ESTRANHO]);
  });

  it("valor que não é 'eu' nem uuid é recusado (422)", async () => {
    fazerSupabase([ANA]);
    const { status } = await listar("assigned_to=todos");
    expect(status).toBe(422);
  });

  it("não amplia o papel: a régua continua a da lista (viewer), sem o filtro e com ele", async () => {
    fazerSupabase([ANA]);
    await listar("");
    await listar("assigned_to=eu");
    expect(papelMinimo).toEqual(["viewer", "viewer"]);
  });

  it("CONTROLE: sem o filtro, a lista não ganha recorte por responsável", async () => {
    const chamadas = fazerSupabase([ANA]);
    await listar("aberto=true");
    expect(daLista(chamadas)!.filtros.map(([c]) => c)).not.toContain("assigned_to");
  });
});
