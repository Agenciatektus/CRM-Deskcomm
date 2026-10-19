/**
 * POST /api/v1/leads/[id]/clone MOVE O MESMO CARD (migration 9053, decisão do
 * Peterson de 19/10/2026). O fake do banco simula `fn_mover_lead_de_funil` (o
 * retrato em `crm_lead_passagens_de_funil` + o UPDATE do mesmo lead); a prova do
 * SQL de verdade é `tests/invariants/troca-de-funil-move-o-card-9053.test.ts`.
 *
 * CONTROLE NEGATIVO do caso principal: depois da troca continua existindo UM
 * negócio só (nenhum insert em `crm_leads`), e o ganho do funil de origem contado
 * só pelo `pipeline_id` atual daria ZERO: quem o mantém é a passagem.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createClient } from "@/lib/supabase/server";

const adminRpc = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/leads/activity-write-failure", () => ({
  registraFalhaDeAtividade: vi.fn(async () => undefined),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";
const VENDAS = "44444444-4444-4444-8444-444444444444";
const POS_VENDA = "55555555-5555-4555-8555-555555555555";
const S_GANHO = "66666666-6666-4666-8666-666666666666";
const S_POS_1 = "88888888-8888-4888-8888-888888888888";
const S_POS_2 = "99999999-9999-4999-8999-999999999999";

type Row = Record<string, unknown>;
/** As tabelas que o seed sempre traz; as demais nascem sob demanda no fake. */
type Tabelas = Record<string, Row[]> & { crm_pipelines: Row[]; crm_stages: Row[]; crm_leads: Row[] };

function fakeDb(tables: Tabelas) {
  const inserts: string[] = [];
  function from(table: string) {
    const filtros: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ??= []);
    const sel = () => rows().filter((r) => filtros.every((f) => f(r)));
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      limit: () => b,
      eq: (c: string, v: unknown) => {
        filtros.push((r) => r[c] === v);
        return b;
      },
      in: (c: string, vs: unknown[]) => {
        filtros.push((r) => vs.includes(r[c]));
        return b;
      },
      insert: () => {
        inserts.push(table);
        return b;
      },
      maybeSingle: async () => ({ data: sel()[0] ? { ...sel()[0] } : null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: sel(), error: null }),
    };
    return b;
  }
  const rpc = vi.fn(async (nome: string, a: Record<string, unknown>) => {
    if (nome !== "fn_mover_lead_de_funil") return { data: null, error: null };
    const lead = tables.crm_leads.find((l) => l.id === a.p_lead && l.organization_id === a.p_org);
    if (!lead) return { data: null, error: { message: "lead_not_found" } };
    (tables.crm_lead_passagens_de_funil ??= []).push({
      lead_id: lead.id,
      de_pipeline_id: lead.pipeline_id,
      de_stage_id: lead.stage_id,
      status_na_saida: lead.status,
      value_cents: lead.value_cents,
      closed_at: lead.closed_at ?? null,
    });
    Object.assign(lead, {
      pipeline_id: a.p_pipeline,
      stage_id: a.p_stage,
      status: "open",
      closed_at: null,
      value_cents: lead.status === "won" ? null : lead.value_cents,
    });
    return { data: { ...lead }, error: null };
  });
  return { client: { from, rpc } as never, rpc, inserts };
}

function seed(exigeCampo = false): Tabelas {
  const etapa = (id: string, pipeline_id: string, position: number, is_won = false) => ({
    id,
    organization_id: ORG_ID,
    pipeline_id,
    position,
    is_won,
    is_lost: false,
    is_archived: false,
  });
  return {
    crm_pipelines: [
      { id: VENDAS, organization_id: ORG_ID, name: "Vendas", settings: {} },
      {
        id: POS_VENDA,
        organization_id: ORG_ID,
        name: "Pós-venda",
        settings: exigeCampo
          ? { fields: [{ key: "nps", label: "NPS", type: "text", obrigatorio_em: { etapas: [S_POS_1] } }] }
          : {},
      },
    ],
    crm_stages: [etapa(S_GANHO, VENDAS, 9, true), etapa(S_POS_1, POS_VENDA, 1), etapa(S_POS_2, POS_VENDA, 2)],
    crm_leads: [
      {
        id: LEAD_ID,
        organization_id: ORG_ID,
        pipeline_id: VENDAS,
        stage_id: S_GANHO,
        status: "won",
        value_cents: 500000,
        closed_at: "2026-10-18T12:00:00.000Z",
        contact_id: null,
        custom_fields: {},
      },
    ],
  };
}

/** Ganhos de um funil como a métrica conta desde a 9053: atual + passagens. */
function ganhosDoFunil(t: Tabelas, funil: string, comPassagens = true) {
  const atuais = t.crm_leads.filter((l) => l.pipeline_id === funil && l.status === "won");
  const passadas = comPassagens
    ? (t.crm_lead_passagens_de_funil ?? []).filter(
        (p) => p.de_pipeline_id === funil && p.status_na_saida === "won",
      )
    : [];
  const todos = [...atuais, ...passadas];
  return { quantidade: todos.length, centavos: todos.reduce((s, r) => s + Number(r.value_cents ?? 0), 0) };
}

function req(body: Row) {
  return new NextRequest(`http://localhost/api/v1/leads/${LEAD_ID}/clone`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: LEAD_ID }) };

let tables: Tabelas;
let db: ReturnType<typeof fakeDb>;

function prepara(exigeCampo = false) {
  tables = seed(exigeCampo);
  db = fakeDb(tables);
  vi.mocked(createClient).mockResolvedValue(db.client);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER_ID, idioma: "pt-BR" },
    org: { orgId: ORG_ID },
  } as never);
  prepara();
});

describe("POST /clone — levar para outro funil move o MESMO card", () => {
  it("ganho em Vendas vai ao Pós-venda: mesmo id, um negócio só, e Vendas segue contando o ganho", async () => {
    const res = await POST(req({ pipeline_id: POS_VENDA }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { lead: Row } };

    expect(body.data.lead.id).toBe(LEAD_ID);
    expect(body.data.lead).toMatchObject({ pipeline_id: POS_VENDA, stage_id: S_POS_1, status: "open" });

    // CONTROLE NEGATIVO 1: nenhum negócio novo.
    expect(tables.crm_leads).toHaveLength(1);
    expect(db.inserts).not.toContain("crm_leads");

    // A origem mantém o ganho e o valor da época...
    expect(ganhosDoFunil(tables, VENDAS)).toEqual({ quantidade: 1, centavos: 500000 });
    // ...e CONTROLE NEGATIVO 2: pelo pipeline_id atual, sem a passagem, daria zero.
    expect(ganhosDoFunil(tables, VENDAS, false)).toEqual({ quantidade: 0, centavos: 0 });
    // O destino não ganha nada de graça (o card chegou aberto e sem o valor da venda).
    expect(ganhosDoFunil(tables, POS_VENDA)).toEqual({ quantidade: 0, centavos: 0 });
  });

  it("não reemite won/lost/created nem stage_changed (nenhum evento pelo admin)", async () => {
    await POST(req({ pipeline_id: POS_VENDA }), ctx);
    expect(adminRpc).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith(
      "fn_mover_lead_de_funil",
      expect.objectContaining({
        p_org: ORG_ID,
        p_lead: LEAD_ID,
        p_pipeline: POS_VENDA,
        p_stage: S_POS_1,
        p_ator: USER_ID,
      }),
    );
  });

  it("'rodar as automações de entrada' ligada: UM lead.stage_changed marcado para a etapa de destino; o duplo clique não emite de novo", async () => {
    const primeiro = await POST(req({ pipeline_id: POS_VENDA, rodar_automacoes_de_entrada: true }), ctx);
    expect(primeiro.status).toBe(200);
    // O duplo clique: o card já está no destino, a troca é recusada e nada mais sai.
    const segundo = await POST(req({ pipeline_id: POS_VENDA, rodar_automacoes_de_entrada: true }), ctx);
    expect(segundo.status).toBe(422);

    const emitidos = db.rpc.mock.calls.filter(([nome]) => nome === "emit_event");
    expect(emitidos).toHaveLength(1);
    expect(emitidos[0]![1]).toMatchObject({
      p_event_type: "lead.stage_changed",
      p_entity_kind: "crm_lead",
      p_entity_id: LEAD_ID,
      p_payload: { pipeline_id: POS_VENDA, from_pipeline_id: VENDAS, to_stage_id: S_POS_1 },
      p_metadata: { entrada_pela_troca_de_funil: true, actor_user_id: USER_ID },
    });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("CONTROLE NEGATIVO: opção desligada (explícita) não emite evento de etapa", async () => {
    await POST(req({ pipeline_id: POS_VENDA, rodar_automacoes_de_entrada: false }), ctx);
    expect(db.rpc.mock.calls.filter(([nome]) => nome === "emit_event")).toHaveLength(0);
  });

  it("a passagem entra na linha do tempo do mesmo card", async () => {
    await POST(req({ pipeline_id: POS_VENDA }), ctx);
    expect(vi.mocked(emitLeadActivity)).toHaveBeenCalledWith(
      db.client,
      expect.objectContaining({
        leadId: LEAD_ID,
        type: "moved_from_pipeline",
        reason: "Saiu do funil Vendas (ganho) e entrou no funil Pós-venda",
        payload: expect.objectContaining({
          from_pipeline_id: VENDAS,
          from_status: "won",
          from_value_cents: 500000,
        }),
      }),
    );
  });

  it("etapa escolhida do destino é respeitada; aberto também move, com o valor", async () => {
    Object.assign(tables.crm_leads[0]!, { status: "open", closed_at: null });
    const res = await POST(req({ pipeline_id: POS_VENDA, stage_id: S_POS_2 }), ctx);
    expect(res.status).toBe(200);
    expect(tables.crm_leads[0]!).toMatchObject({ pipeline_id: POS_VENDA, stage_id: S_POS_2, value_cents: 500000 });
    expect(tables.crm_leads).toHaveLength(1);
  });

  it("mesmo funil é recusa (isso é /move), sem escrever", async () => {
    const res = await POST(req({ pipeline_id: VENDAS }), ctx);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("pipeline_unchanged");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("funil de destino de outra organização é 404, sem escrever", async () => {
    tables.crm_pipelines[1]!.organization_id = "outra-org";
    const res = await POST(req({ pipeline_id: POS_VENDA }), ctx);
    expect(res.status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("campo exigido pela etapa de destino faltando: 422 antes da escrita", async () => {
    prepara(true);
    const res = await POST(req({ pipeline_id: POS_VENDA }), ctx);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("required_fields_missing");
    expect(db.rpc).not.toHaveBeenCalled();
    expect(tables.crm_leads[0]!.pipeline_id).toBe(VENDAS);
  });
});
