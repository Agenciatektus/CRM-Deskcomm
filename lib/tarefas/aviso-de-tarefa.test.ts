import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { avisarTarefasNaHora, textoDoAviso, type EnviarPush } from "./aviso-de-tarefa";

/**
 * O AVISO NA HORA DA TAREFA (migration 9043).
 *
 * O dublê do banco APLICA os filtros sobre linhas em memória (eq, is, in, lte,
 * gt, o `or` de responsável/criador): "pega as certas" só fica verde se a
 * consulta da rodada for a certa — um dublê que devolvesse a lista pronta
 * aprovaria qualquer filtro.
 */

type Linha = Record<string, unknown>;
type Filtro = (l: Linha) => boolean;

const AGORA = new Date("2026-10-07T14:00:00.000Z");
const ORG = "o-1";
const OUTRA = "o-2";
const ANA = "u-ana";
const BIA = "u-bia";
const EX = "u-ex";

let tabelas: Record<string, Linha[]>;
let inseridos: Array<{ tabela: string; linha: Linha }>;

function minutos(m: number): string {
  return new Date(AGORA.getTime() + m * 60_000).toISOString();
}

function tarefa(id: string, extra: Linha = {}): Linha {
  return {
    id, organization_id: ORG, title: `Tarefa ${id}`, status: "pending", due_date: minutos(-1),
    reminded_at: null, lead_id: null, contact_id: null, assigned_to: ANA, created_by: null, ...extra,
  };
}

function consulta(tabela: string) {
  const filtros: Filtro[] = [];
  let mudanca: Linha | null = null;
  let ordem: { coluna: string; asc: boolean } | null = null;
  let limite = Infinity;
  const linhas = () => (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
  const resultado = () => {
    let r = linhas();
    if (mudanca) {
      for (const l of r) Object.assign(l, mudanca);
    }
    if (ordem) {
      const { coluna: c, asc } = ordem;
      r = [...r].sort((a, b) => String(a[c] ?? "").localeCompare(String(b[c] ?? "")) * (asc ? 1 : -1));
    }
    return r.slice(0, limite);
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
    is: (c: string, v: unknown) => (filtros.push((l) => (l[c] ?? null) === v), q),
    in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
    lte: (c: string, v: string) => (filtros.push((l) => typeof l[c] === "string" && (l[c] as string) <= v), q),
    gt: (c: string, v: string) => (filtros.push((l) => typeof l[c] === "string" && (l[c] as string) > v), q),
    or: (expr: string) => {
      expect(expr).toBe("assigned_to.not.is.null,created_by.not.is.null");
      filtros.push((l) => l.assigned_to != null || l.created_by != null);
      return q;
    },
    order: (c: string, o?: { ascending?: boolean }) => ((ordem = { coluna: c, asc: o?.ascending ?? true }), q),
    limit: (n: number) => ((limite = n), q),
    update: (m: Linha) => ((mudanca = m), q),
    insert: (l: Linha) => {
      inseridos.push({ tabela, linha: l });
      return Promise.resolve({ error: null });
    },
    maybeSingle: () => Promise.resolve({ data: resultado()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: resultado(), error: null }).then(ok),
  };
  return q;
}

function banco(): SupabaseClient {
  return {
    from: consulta,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { user_metadata: { full_name: id === ANA ? "Ana Lima" : null } } },
        }),
      },
    },
  } as unknown as SupabaseClient;
}

let push: ReturnType<typeof vi.fn> & EnviarPush;

beforeEach(() => {
  inseridos = [];
  push = vi.fn(async () => ({ sent: 1 })) as typeof push;
  tabelas = {
    crm_tasks: [],
    organizations: [{ id: ORG, locale: "pt-BR" }, { id: OUTRA, locale: "es" }],
    user_organizations: [
      { user_id: ANA, organization_id: ORG, revoked_at: null },
      { user_id: BIA, organization_id: ORG, revoked_at: null },
      { user_id: BIA, organization_id: OUTRA, revoked_at: null },
      { user_id: EX, organization_id: ORG, revoked_at: "2026-09-01T00:00:00Z" },
    ],
    contacts: [{ id: "c-1", organization_id: ORG, name: "Maria Souza", display_name: null, phone_number: "+5511999990000" }],
    conversations: [
      { id: "conv-velha", organization_id: ORG, contact_id: "c-1", last_message_at: "2026-10-01T00:00:00Z" },
      { id: "conv-nova", organization_id: ORG, contact_id: "c-1", last_message_at: "2026-10-07T13:00:00Z" },
    ],
    crm_leads: [{ id: "l-1", organization_id: ORG, pipeline_id: "p-1" }],
  };
});

const avisosDaCentral = () => inseridos.filter((i) => i.tabela === "agent_inbox_items").map((i) => i.linha);
const rodar = () => avisarTarefasNaHora(banco(), push, AGORA);

describe("avisarTarefasNaHora — quais tarefas", () => {
  it("⭐ pega só a aberta vencida há até 24h e ainda não avisada", async () => {
    tabelas.crm_tasks = [
      tarefa("certa"),
      tarefa("em-andamento", { status: "in_progress", due_date: minutos(-30) }),
      tarefa("concluida", { status: "done" }),
      tarefa("cancelada", { status: "cancelled" }),
      tarefa("futura", { due_date: minutos(5) }),
      tarefa("antiga", { due_date: minutos(-24 * 60 - 1) }),
      tarefa("ja-avisada", { reminded_at: minutos(-1) }),
      tarefa("sem-prazo", { due_date: null }),
    ];
    const r = await rodar();
    expect(r.avisadas).toBe(2);
    expect(push.mock.calls.map((c) => c[2].tag).sort()).toEqual(["task-due:certa", "task-due:em-andamento"]);
    const carimbadas = tabelas.crm_tasks.filter((t) => t.reminded_at === AGORA.toISOString()).map((t) => t.id);
    expect(carimbadas.sort()).toEqual(["certa", "em-andamento"]);
  });

  it("o teto da rodada pega primeiro a mais antiga", async () => {
    tabelas.crm_tasks = [
      tarefa("recente", { due_date: minutos(-1) }),
      tarefa("mais-antiga", { due_date: minutos(-600) }),
      tarefa("meio", { due_date: minutos(-60) }),
    ];
    await rodar();
    expect(push.mock.calls.map((c) => c[2].tag)).toEqual(["task-due:mais-antiga", "task-due:meio", "task-due:recente"]);
  });

  it("é idempotente: a segunda rodada não avisa de novo", async () => {
    tabelas.crm_tasks = [tarefa("t1")];
    await rodar();
    const segunda = await rodar();
    expect(segunda).toMatchObject({ examinadas: 0, avisadas: 0 });
    expect(push).toHaveBeenCalledTimes(1);
    expect(avisosDaCentral()).toHaveLength(1);
  });

  it("perde a corrida em silêncio: tarefa reivindicada por outra réplica não gera aviso", async () => {
    tabelas.crm_tasks = [tarefa("t1")];
    const db = banco();
    const from = db.from.bind(db);
    // A outra réplica carimba entre a leitura e a reivindicação desta.
    (db as unknown as { from: unknown }).from = (t: string) => {
      const q = from(t) as unknown as Record<string, (...a: unknown[]) => unknown>;
      if (t !== "crm_tasks") return q;
      const update = q.update!;
      q.update = (m: unknown) => {
        tabelas.crm_tasks![0]!.reminded_at = "outra-replica";
        return update(m);
      };
      return q;
    };
    const r = await avisarTarefasNaHora(db, push, AGORA);
    expect(r).toMatchObject({ avisadas: 0, pulados: { ja_reivindicada: 1 } });
    expect(push).not.toHaveBeenCalled();
    expect(avisosDaCentral()).toHaveLength(0);
  });

  it("sem responsável avisa quem criou; sem os dois, nem entra na varredura", async () => {
    tabelas.crm_tasks = [
      tarefa("do-criador", { assigned_to: null, created_by: BIA }),
      tarefa("orfa", { assigned_to: null, created_by: null }),
    ];
    const r = await rodar();
    expect(r.examinadas).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![1]).toBe(BIA);
    expect(tabelas.crm_tasks.find((t) => t.id === "orfa")!.reminded_at).toBeNull();
  });

  it("ex-membro não recebe: carimba e pula", async () => {
    tabelas.crm_tasks = [tarefa("t1", { assigned_to: EX })];
    const r = await rodar();
    expect(r.pulados).toEqual({ destinatario_fora_da_org: 1 });
    expect(push).not.toHaveBeenCalled();
    expect(tabelas.crm_tasks[0]!.reminded_at).toBe(AGORA.toISOString());
  });
});

describe("avisarTarefasNaHora — o aviso e o push", () => {
  it("⭐ abre o aviso task_due na org da tarefa, apontando para a conversa mais recente do contato", async () => {
    tabelas.crm_tasks = [tarefa("t1", { contact_id: "c-1", lead_id: "l-1", title: "Ligar para confirmar" })];
    await rodar();
    expect(avisosDaCentral()).toEqual([
      {
        organization_id: ORG, kind: "task_due", severity: "warn",
        title: "Hora da tarefa: Ligar para confirmar",
        body: "Responsável: Ana Lima. Contato: Maria Souza.",
        ref_kind: "conversation", ref_id: "conv-nova",
      },
    ]);
    expect(push).toHaveBeenCalledWith(ORG, ANA, {
      title: "Hora da tarefa", body: "Ligar para confirmar", tag: "task-due:t1", href: "/app/inbox/conv-nova",
    });
  });

  it("sem conversa, leva ao negócio no funil dele; sem nada, à lista de Tarefas", async () => {
    tabelas.crm_tasks = [tarefa("com-lead", { lead_id: "l-1" }), tarefa("solta")];
    await rodar();
    const porTag = Object.fromEntries(push.mock.calls.map((c) => [c[2].tag, c[2].href]));
    expect(porTag).toEqual({ "task-due:com-lead": "/app/pipelines/p-1?lead=l-1", "task-due:solta": "/app/tasks" });
    expect(avisosDaCentral().map((a) => a.ref_kind)).toEqual(["lead", null]);
  });

  it("o push não carrega o nome nem o telefone do cliente", async () => {
    tabelas.crm_tasks = [tarefa("t1", { contact_id: "c-1" })];
    await rodar();
    const payload = JSON.stringify(push.mock.calls[0]![2]);
    expect(payload).not.toContain("Maria");
    expect(payload).not.toContain("99999");
    expect(JSON.stringify(avisosDaCentral())).not.toContain("99999");
  });

  it("sai no idioma da organização da tarefa", async () => {
    tabelas.crm_tasks = [tarefa("t1", { organization_id: OUTRA, assigned_to: BIA, title: "Llamar" })];
    await rodar();
    expect(avisosDaCentral()[0]!.title).toBe("Hora de la tarea: Llamar");
    expect(push.mock.calls[0]![2].title).toBe("Hora de la tarea");
  });

  it("push que falha não desfaz o aviso nem faz a tarefa apitar de novo", async () => {
    tabelas.crm_tasks = [tarefa("t1")];
    push.mockRejectedValueOnce(new Error("vapid"));
    const r = await rodar();
    expect(r.avisadas).toBe(1);
    expect(avisosDaCentral()).toHaveLength(1);
    expect((await rodar()).avisadas).toBe(0);
  });
});

describe("textoDoAviso", () => {
  it("sem responsável nem contato nomeado, o corpo fica nulo", () => {
    expect(textoDoAviso({ titulo: "X", responsavel: null, contato: null, idioma: "pt-BR" }).body).toBeNull();
  });
});
