/**
 * POST /api/v1/tasks/bulk — as ações em massa da tela de Tarefas com a MESMA
 * autorização das rotas de uma tarefa: suporte somente-leitura recusado antes
 * do efeito, papel `agent`+, organização do COOKIE em toda leitura e escrita,
 * responsável conferido na equipe, prazo no passado recusado.
 *
 * Cada caso de recusa prova também que `crm_tasks` NÃO foi tocada (controle
 * negativo): status 422 com a escrita feita mesmo assim seria o pior defeito.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: () => true }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const DE_FORA = "66666666-6666-4666-8666-666666666666";
const T1 = "55555555-5555-4555-8555-000000000001";
const T2 = "55555555-5555-4555-8555-000000000002";
const T3 = "55555555-5555-4555-8555-000000000003"; // de outra organização: não vem no escopo
const LEAD = "77777777-7777-4777-8777-777777777777";

function sessao(papel: Role = "agent") {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

interface Chamada {
  tabela: string;
  op: string;
  valores?: unknown;
  eq: Array<[string, unknown]>;
  inn: Array<[string, unknown]>;
}

/** Dublê que anota cada chamada (tabela, operação, valores, filtros) e responde em ordem. */
function duble(respostas: Array<{ data?: unknown; error?: { message: string } | null }>) {
  const chamadas: Chamada[] = [];
  let i = 0;
  const from = (tabela: string) => {
    const c: Chamada = { tabela, op: "select", eq: [], inn: [] };
    chamadas.push(c);
    const r = respostas[Math.min(i++, respostas.length - 1)] ?? {};
    const devolve = () => Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    const elo: Record<string, unknown> = {};
    for (const m of ["order", "limit", "is", "neq", "select"]) elo[m] = () => elo;
    elo.update = (v: unknown) => ((c.op = "update"), (c.valores = v), elo);
    elo.delete = () => ((c.op = "delete"), elo);
    elo.insert = (v: unknown) => ((c.op = "insert"), (c.valores = v), elo);
    elo.eq = (col: string, v: unknown) => (c.eq.push([col, v]), elo);
    elo.in = (col: string, v: unknown) => (c.inn.push([col, v]), elo);
    elo.single = devolve;
    elo.maybeSingle = devolve;
    elo.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => devolve().then(res, rej);
    return elo;
  };
  return { client: { from }, chamadas };
}

function montar(equipe: { data?: unknown; error?: { message: string } | null }, tarefas: Array<{ data?: unknown; error?: { message: string } | null }>) {
  const e = duble([equipe]);
  const t = duble(tarefas);
  vi.mocked(createAdminClient).mockReturnValue(e.client as never);
  vi.mocked(createClient).mockResolvedValue(t.client as never);
  return { equipe: e, tarefas: t };
}

const post = (corpo: unknown) =>
  new NextRequest("http://x/api/v1/tasks/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

const futuro = () => new Date(Date.now() + 86_400_000).toISOString();
const ESCOPO = [
  { id: T1, title: "Ligar", status: "pending", due_date: null, priority: "medium", lead_id: LEAD, contact_id: null },
  { id: T2, title: "Enviar", status: "done", due_date: null, priority: "medium", lead_id: null, contact_id: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

async function rota() {
  return (await import("@/app/api/v1/tasks/bulk/route")).POST;
}

describe("autorização", () => {
  it("⭐ suporte somente-leitura é recusado ANTES de qualquer consulta", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(fail("support_read_only", "Somente leitura.", 403, {}) as never);
    const m = montar({}, [{ data: ESCOPO }]);
    const res = await (await rota())(post({ action: "complete", task_ids: [T1] }));
    expect(res.status).toBe(403);
    expect(m.tarefas.chamadas).toEqual([]);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("⭐ viewer é 403 e nada é tocado (controle: agent passa)", async () => {
    sessao("viewer");
    const m = montar({}, [{ data: ESCOPO }]);
    const res = await (await rota())(post({ action: "delete", task_ids: [T1] }));
    expect(res.status).toBe(403);
    expect(m.tarefas.chamadas).toEqual([]);

    sessao("agent");
    const m2 = montar({}, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    expect((await (await rota())(post({ action: "delete", task_ids: [T1] }))).status).toBe(200);
    expect(m2.tarefas.chamadas.some((c) => c.op === "delete")).toBe(true);
  });

  it("corpo inválido é 422 sem tocar o banco", async () => {
    const m = montar({}, [{ data: ESCOPO }]);
    const res = await (await rota())(post({ action: "complete", task_ids: ["nao-e-uuid"] }));
    expect(res.status).toBe(422);
    expect(m.tarefas.chamadas).toEqual([]);
  });

  it("⭐ toda leitura e escrita filtra pela organização da SESSÃO", async () => {
    const m = montar({}, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    await (await rota())(post({ action: "priority", task_ids: [T1, T2], priority: "high" }));
    expect(m.tarefas.chamadas.length).toBe(2);
    for (const c of m.tarefas.chamadas) expect(c.eq).toContainEqual(["organization_id", ORG]);
  });
});

describe("escopo", () => {
  it("⭐ id de outra organização volta em `ignoradas` e não entra na escrita", async () => {
    const m = montar({}, [{ data: ESCOPO }, { data: [{ id: T1 }, { id: T2 }] }]);
    const res = await (await rota())(post({ action: "priority", task_ids: [T1, T2, T3], priority: "urgent" }));
    const corpo = (await res.json()) as { data: { feitas: number; ignoradas: string[] } };
    expect(corpo.data).toEqual({ feitas: 2, ignoradas: [T3] });
    const escrita = m.tarefas.chamadas.find((c) => c.op === "update")!;
    expect(escrita.inn).toEqual([["id", [T1, T2]]]);
    expect(escrita.valores).toEqual({ priority: "urgent" });
  });

  it("o que conta como feito é o que o banco DEVOLVEU (a policy pode recusar em silêncio)", async () => {
    montar({}, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    const res = await (await rota())(post({ action: "delete", task_ids: [T1, T2] }));
    const corpo = (await res.json()) as { data: { feitas: number } };
    expect(corpo.data.feitas).toBe(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "crm_task.deleted", resourceId: T1, organizationId: ORG });
  });
});

describe("concluir", () => {
  it("⭐ só fecha a que ainda pede ação, e registra na linha do tempo do negócio", async () => {
    const m = montar({}, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    const res = await (await rota())(post({ action: "complete", task_ids: [T1, T2] }));
    expect(res.status).toBe(200);
    const escrita = m.tarefas.chamadas.find((c) => c.op === "update")!;
    // T2 já está `done`: concluir de novo emitiria outra "Tarefa concluída".
    expect(escrita.inn).toEqual([["id", [T1]]]);
    expect(escrita.valores).toEqual({ status: "done" });
    expect(emitLeadActivity).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitLeadActivity).mock.calls[0]![1]).toMatchObject({ leadId: LEAD, type: "task_completed", sourceId: T1 });
  });
});

describe("reatribuir", () => {
  it("⭐ responsável fora da equipe é 422 e as tarefas NÃO são tocadas", async () => {
    const m = montar({ data: null }, [{ data: ESCOPO }]);
    const res = await (await rota())(post({ action: "assign", task_ids: [T1], assigned_to: DE_FORA }));
    expect(res.status).toBe(422);
    expect(m.tarefas.chamadas).toEqual([]);
    expect(m.equipe.chamadas[0]!.eq).toContainEqual(["organization_id", ORG]);
  });

  it("membro da equipe é aceito; tirar o responsável (null) nem consulta a equipe", async () => {
    const m = montar({ data: { user_id: ANA } }, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    expect((await (await rota())(post({ action: "assign", task_ids: [T1], assigned_to: ANA }))).status).toBe(200);
    expect(m.tarefas.chamadas.find((c) => c.op === "update")!.valores).toEqual({ assigned_to: ANA });

    const m2 = montar({ data: null }, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    expect((await (await rota())(post({ action: "assign", task_ids: [T1], assigned_to: null }))).status).toBe(200);
    expect(m2.equipe.chamadas).toEqual([]);
  });

  it("falha ao consultar a equipe é 500, nunca aceite", async () => {
    const m = montar({ error: { message: "timeout" } }, [{ data: ESCOPO }]);
    expect((await (await rota())(post({ action: "assign", task_ids: [T1], assigned_to: ANA }))).status).toBe(500);
    expect(m.tarefas.chamadas).toEqual([]);
  });
});

describe("adiar", () => {
  it("⭐ prazo no passado é 422 e nada é tocado", async () => {
    const m = montar({}, [{ data: ESCOPO }]);
    const res = await (await rota())(post({ action: "postpone", itens: [{ id: T1, due_date: "2020-01-01T09:00:00.000Z" }] }));
    expect(res.status).toBe(422);
    expect(m.tarefas.chamadas).toEqual([]);
  });

  it("re-arma o aviso (`reminded_at` nulo) e pula a encerrada", async () => {
    const prazo = futuro();
    const m = montar({}, [{ data: ESCOPO }, { data: [{ id: T1 }] }]);
    const res = await (await rota())(post({ action: "postpone", itens: [{ id: T1, due_date: prazo }, { id: T2, due_date: prazo }] }));
    const corpo = (await res.json()) as { data: { feitas: number } };
    expect(corpo.data.feitas).toBe(1);
    const escritas = m.tarefas.chamadas.filter((c) => c.op === "update");
    expect(escritas).toHaveLength(1);
    expect(escritas[0]!.valores).toEqual({ due_date: prazo, reminded_at: null });
    expect(escritas[0]!.eq).toContainEqual(["id", T1]);
  });
});

describe("falhas no meio do lote", () => {
  it("⭐ reatribuir para quem a policy recusa (42501) é 403 com motivo, não 500", async () => {
    montar({ data: { user_id: ANA } }, [{ data: ESCOPO }, { error: { message: "new row violates row-level security policy", code: "42501" } as never }]);
    const res = await (await rota())(post({ action: "assign", task_ids: [T1], assigned_to: ANA }));
    expect(res.status).toBe(403);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toMatch(/permissão/);
    expect(audit).not.toHaveBeenCalled();
  });

  it("erro que não é da policy continua 500 (controle)", async () => {
    montar({}, [{ data: ESCOPO }, { error: { message: "timeout", code: "57014" } as never }]);
    expect((await (await rota())(post({ action: "priority", task_ids: [T1], priority: "low" }))).status).toBe(500);
  });

  it("⭐ adiar: o item já gravado AUDITA mesmo quando o seguinte falha", async () => {
    const ESCOPO_ABERTO = [ESCOPO[0], { ...ESCOPO[1], status: "pending" }];
    const prazo = futuro();
    montar({}, [{ data: ESCOPO_ABERTO }, { data: [{ id: T1 }] }, { error: { message: "timeout", code: "57014" } as never }]);
    const res = await (await rota())(post({ action: "postpone", itens: [{ id: T1, due_date: prazo }, { id: T2, due_date: prazo }] }));
    expect(res.status).toBe(500);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ resourceId: T1, action: "crm_task.updated" });
  });
});

describe("GET /api/v1/tasks — encerradas recentes", () => {
  function dubleDaLista() {
    const ors: string[] = [];
    const ins: Array<[string, unknown]> = [];
    const elo: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "gte", "lte"]) elo[m] = () => elo;
    elo.or = (f: string) => (ors.push(f), elo);
    elo.in = (c: string, v: unknown) => (ins.push([c, v]), elo);
    elo.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    vi.mocked(createClient).mockResolvedValue({ from: () => elo } as never);
    return { ors, ins };
  }
  const get = (qs: string) => new NextRequest(`http://x/api/v1/tasks?${qs}`);

  it("⭐ aberto + encerradas_desde traz as abertas OU as encerradas desde o instante", async () => {
    const d = dubleDaLista();
    const { GET } = await import("@/app/api/v1/tasks/route");
    const res = await GET(get("aberto=true&encerradas_desde=2026-10-15T03:00:00.000Z"));
    expect(res.status).toBe(200);
    expect(d.ors).toEqual(["status.in.(pending,in_progress),and(status.in.(done,cancelled),updated_at.gte.2026-10-15T03:00:00.000Z)"]);
    expect(d.ins).toEqual([]);
  });

  it("sem o instante, só as abertas (controle: o comportamento de antes)", async () => {
    const d = dubleDaLista();
    const { GET } = await import("@/app/api/v1/tasks/route");
    await GET(get("aberto=true"));
    expect(d.ors).toEqual([]);
    expect(d.ins).toEqual([["status", ["pending", "in_progress"]]]);
  });

  it("instante fora do formato é 422 (nada de texto livre no `or` do PostgREST)", async () => {
    dubleDaLista();
    const { GET } = await import("@/app/api/v1/tasks/route");
    const res = await GET(get("aberto=true&encerradas_desde=2026-10-15),id.not.is.null"));
    expect(res.status).toBe(422);
  });
});
