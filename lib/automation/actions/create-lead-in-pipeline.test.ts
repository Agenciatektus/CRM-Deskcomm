import { beforeEach, describe, expect, it, vi } from "vitest";

const adminRpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: unknown) => ({ data: null, error: null })));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: adminRpc }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
// O dublê importa `createClient`/`requireRole` de verdade (ver o cabeçalho de
// `create-or-move-lead.test.ts`): sem estes mocks, o boot do módulo valida env.
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/create-lead-in-pipeline";
import { chaveDoCard, ehViolacaoDaChave } from "@/lib/automation/actions/create-lead-in-pipeline";
import { ApiError } from "@/lib/api/types";
import type { ActionCtx } from "@/lib/automation/types";
import {
  ORG_ID,
  OUTRA_ORG,
  PIPE,
  etapa,
  funilRow,
  makeDb,
  type LeadRow,
} from "@/tests/helpers/stages-db-double";

/**
 * "Criar card em outro funil" — o caso da loja com três funis.
 *
 * Vendas (PIPE) → Pós-venda (POS). O card de Vendas entra em "Pago" (ganho) e
 * um card NOVO nasce no Pós-venda para o mesmo contato. O de Vendas não pode
 * ser tocado: ele continua ganho e contando na receita.
 *
 * Controle negativo feito ao escrever (sabotagem e volta, fora do commit):
 *   - tirar `.eq("organization_id", org)` da leitura do funil de destino →
 *     "funil de OUTRA organização" reprova (o card nasce na org errada);
 *   - tirar a checagem `cardDaChave` → "a mesma regra rodando de novo" e
 *     "o card nascido já fechou" reprovam (nasce um segundo card).
 */

const POS = "55555555-5555-4555-8555-555555555555";
const CONTATO = "contato-1";
const DONO = "66666666-6666-4666-8666-666666666666";

const VENDAS_NOVO = etapa({ id: "v-novo", name: "Novo", position: 1000 });
const VENDAS_PAGO = etapa({ id: "v-pago", name: "Pago", position: 2000, is_won: true });
const POS_ENVIO = etapa({ id: "p-envio", name: "Envio", position: 1000, pipeline_id: POS });
const POS_ENTREGUE = etapa({ id: "p-entregue", name: "Entregue", position: 2000, pipeline_id: POS, is_won: true });
const POS_TROCA_CANCELADA = etapa({ id: "p-cancelada", name: "Cancelada", position: 3000, pipeline_id: POS, is_lost: true });

function cardDeVendas(over: Record<string, unknown> = {}): LeadRow {
  return {
    id: "venda-1",
    stage_id: "v-pago",
    pipeline_id: PIPE,
    organization_id: ORG_ID,
    contact_id: CONTATO,
    status: "won",
    title: "Pedido #1042",
    value_cents: 25_990,
    currency: "BRL",
    owner_user_id: DONO,
    owner_agent_id: null,
    owner_kind: "user",
    source: "manual",
    external_id: null,
    ...over,
  } as unknown as LeadRow;
}

function banco(opts: { leads?: LeadRow[]; posOrg?: string; stages?: ReturnType<typeof etapa>[] } = {}) {
  return makeDb({
    pipelines: [
      funilRow({ id: PIPE, name: "Vendas" }),
      funilRow({ id: POS, name: "Pós-venda", organization_id: opts.posOrg ?? ORG_ID }),
    ],
    stages: opts.stages ?? [VENDAS_NOVO, VENDAS_PAGO, POS_ENVIO, POS_ENTREGUE, POS_TROCA_CANCELADA],
    leads: opts.leads ?? [cardDeVendas()],
  });
}

/** Membros da org e agentes — tabelas que o dublê não semeia pelo `makeDb`. */
function comEquipe(
  db: ReturnType<typeof makeDb>,
  membros: Array<Record<string, unknown>>,
  agentes: Array<Record<string, unknown>> = [],
): ReturnType<typeof makeDb> {
  const tabelas = db.tabelas as unknown as Record<string, unknown[]>;
  tabelas.user_organizations = membros;
  tabelas.ai_agents = agentes;
  return db;
}

const DONO_ATIVO = { organization_id: ORG_ID, user_id: DONO, role: "agent", revoked_at: null };

function ctxDoLead(db: ReturnType<typeof makeDb>, leadId = "venda-1", eventId = "evento-1"): ActionCtx {
  return {
    admin: db.client as unknown as ActionCtx["admin"],
    organizationId: ORG_ID,
    ruleId: "regra-pos-venda",
    ruleName: "Pago → Pós-venda",
    event: { id: eventId } as ActionCtx["event"],
    requestId: eventId,
    // O contexto do motor traz a linha inteira; a ação RELÊ do banco com a org
    // da regra, então o que importa aqui é o id.
    context: { lead: { id: leadId, pipeline_id: PIPE, contact_id: CONTATO } },
  };
}

async function executa(ctx: ActionCtx, config: Record<string, unknown>) {
  const acao = getAction("create_lead_in_pipeline");
  expect(acao, "a ação não está registrada").toBeDefined();
  return acao!.execute(ctx, config);
}

const novos = (db: ReturnType<typeof makeDb>) => db.tabelas.crm_leads.filter((l) => l.pipeline_id === POS);

beforeEach(() => adminRpc.mockClear());

describe("create_lead_in_pipeline — nasce no destino, a origem fica intocada", () => {
  it("cria o card no funil e na etapa escolhidos, para o mesmo contato", async () => {
    const db = banco();
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r.status).toBe("success");
    const [novo, ...resto] = novos(db);
    expect(resto).toHaveLength(0);
    expect(novo).toMatchObject({
      organization_id: ORG_ID,
      pipeline_id: POS,
      stage_id: "p-envio",
      contact_id: CONTATO,
      status: "open",
      title: "Pedido #1042",
      source: "automation",
      external_id: chaveDoCard({ leadId: "venda-1" }, POS),
    });
    expect(r.detail).toEqual({ created: novo!.id, origem: "venda-1" });
  });

  it("NÃO altera o card de origem: nenhuma escrita em crm_leads além do INSERT", async () => {
    const db = banco();
    const antes = structuredClone(db.tabelas.crm_leads.find((l) => l.id === "venda-1"));

    await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(db.tabelas.crm_leads.find((l) => l.id === "venda-1")).toEqual(antes);
    const escritasEmLeads = db.escritas.filter((e) => e.table === "crm_leads");
    expect(escritasEmLeads.map((e) => e.tipo)).toEqual(["insert"]);
  });

  it("sem as flags, valor e dono NÃO são copiados", async () => {
    const db = banco();
    await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(novos(db)[0]).toMatchObject({
      value_cents: null,
      owner_user_id: null,
      owner_agent_id: null,
      owner_kind: null,
    });
  });

  it("com copiar_valor e copiar_dono, valor/moeda e dono vêm da origem (owner_kind coerente)", async () => {
    const db = comEquipe(banco(), [DONO_ATIVO]);
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio", copiar_valor: true, copiar_dono: true });

    expect(novos(db)[0]).toMatchObject({
      value_cents: 25_990,
      currency: "BRL",
      owner_user_id: DONO,
      owner_agent_id: null,
      owner_kind: "user",
    });
    expect(r.detail).not.toHaveProperty("reason");
  });

  it("grava a história nas DUAS timelines", async () => {
    const db = banco();
    await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });
    const novoId = novos(db)[0]!.id;

    const atividades = db.tabelas.crm_lead_activities.map((a) => ({
      lead_id: a.lead_id,
      type: a.type,
      reason: a.reason,
      actor_kind: a.actor_kind,
    }));
    expect(atividades).toEqual([
      {
        lead_id: novoId,
        type: "created_from_pipeline",
        reason: "Criado pela automação a partir do funil Vendas",
        actor_kind: "system",
      },
      {
        lead_id: "venda-1",
        type: "spawned_in_pipeline",
        reason: "Card criado no funil Pós-venda pela automação",
        actor_kind: "system",
      },
    ]);
  });

  it("o lead.created leva request_id rule:<id> — o motor não roda regras sobre ele (anti-loop)", async () => {
    const db = banco();
    await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    const emitido = adminRpc.mock.calls.find(([nome]) => nome === "emit_event");
    expect(emitido).toBeDefined();
    const args = emitido![1] as { p_event_type: string; p_metadata: Record<string, unknown> };
    expect(args.p_event_type).toBe("lead.created");
    expect(args.p_metadata.request_id).toBe("rule:regra-pos-venda");
  });
});

describe("create_lead_in_pipeline — copiar_dono só copia quem ainda atende (P2-2)", () => {
  const CFG = { pipeline_id: POS, stage_id: "p-envio", copiar_dono: true };
  const AGENTE = "77777777-7777-4777-8777-777777777777";

  it.each([
    ["revogado da organização", [{ ...DONO_ATIVO, revoked_at: "2026-09-01T00:00:00Z" }]],
    ["só visualiza (viewer)", [{ ...DONO_ATIVO, role: "viewer" }]],
    ["membro de OUTRA organização", [{ ...DONO_ATIVO, organization_id: OUTRA_ORG }]],
    ["sem vínculo nenhum", []],
  ])("dono %s: o card nasce SEM dono, com o motivo no detalhe", async (_nome, membros) => {
    const db = comEquipe(banco(), membros as Array<Record<string, unknown>>);
    const r = await executa(ctxDoLead(db), CFG);

    expect(r.status).toBe("success");
    expect(r.detail).toMatchObject({ reason: "dono_inativo_nao_copiado", origem: "venda-1" });
    expect(novos(db)).toHaveLength(1);
    expect(novos(db)[0]).toMatchObject({ owner_user_id: null, owner_agent_id: null, owner_kind: null });
  });

  it("a consulta de membro falha: card nasce sem dono, motivo indeterminado (não 'inativo')", async () => {
    const db = comEquipe(banco(), [DONO_ATIVO]);
    const from = db.client.from;
    db.client.from = ((tabela: string) => {
      if (tabela !== "user_organizations") return from(tabela);
      const falhando = {
        select: () => falhando,
        eq: () => falhando,
        is: () => falhando,
        maybeSingle: async () => ({ data: null, error: { code: "08006", message: "connection failure" } }),
      };
      return falhando;
    }) as typeof db.client.from;
    const r = await executa(ctxDoLead(db), CFG);

    expect(r.detail).toMatchObject({ reason: "dono_indeterminado_nao_copiado" });
    expect(novos(db)[0]).toMatchObject({ owner_user_id: null, owner_kind: null });
  });

  it("dono AGENTE arquivado: card nasce sem dono (a criação não cai no 422 do handler)", async () => {
    const db = comEquipe(
      banco({ leads: [cardDeVendas({ owner_user_id: null, owner_agent_id: AGENTE, owner_kind: "ai" })] }),
      [],
      [{ id: AGENTE, organization_id: ORG_ID, archived_at: "2026-09-01T00:00:00Z" }],
    );
    const r = await executa(ctxDoLead(db), CFG);

    expect(r.status).toBe("success");
    expect(r.detail).toMatchObject({ reason: "dono_inativo_nao_copiado" });
    expect(novos(db)[0]).toMatchObject({ owner_agent_id: null, owner_kind: null });
  });

  it("dono AGENTE ativo: é copiado com owner_kind='ai'", async () => {
    const db = comEquipe(
      banco({ leads: [cardDeVendas({ owner_user_id: null, owner_agent_id: AGENTE, owner_kind: "ai" })] }),
      [],
      [{ id: AGENTE, organization_id: ORG_ID, archived_at: null }],
    );
    await executa(ctxDoLead(db), CFG);

    expect(novos(db)[0]).toMatchObject({ owner_agent_id: AGENTE, owner_user_id: null, owner_kind: "ai" });
  });
});

describe("create_lead_in_pipeline — idempotência", () => {
  it("a mesma regra rodando de novo (card tirado de Pago e posto de volta) não cria um segundo", async () => {
    const db = banco();
    await executa(ctxDoLead(db, "venda-1", "evento-1"), { pipeline_id: POS, stage_id: "p-envio" });
    const r = await executa(ctxDoLead(db, "venda-1", "evento-2"), { pipeline_id: POS, stage_id: "p-envio" });

    expect(novos(db)).toHaveLength(1);
    expect(r).toEqual({
      type: "create_lead_in_pipeline",
      status: "success",
      detail: { reason: "card_ja_criado", lead_id: novos(db)[0]!.id },
    });
  });

  it("o card nascido já FECHOU no destino: mesmo assim a origem não gera outro", async () => {
    const db = banco({
      leads: [
        cardDeVendas(),
        {
          id: "pos-antigo",
          stage_id: "p-entregue",
          pipeline_id: POS,
          organization_id: ORG_ID,
          contact_id: CONTATO,
          status: "won",
          source: "automation",
          external_id: chaveDoCard({ leadId: "venda-1" }, POS),
        } as unknown as LeadRow,
      ],
    });
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r.detail).toMatchObject({ reason: "card_ja_criado", lead_id: "pos-antigo" });
    expect(novos(db)).toHaveLength(1);
  });

  it("o contato já tem card ABERTO no destino (criado à mão): não duplica", async () => {
    const db = banco({
      leads: [
        cardDeVendas(),
        {
          id: "pos-manual",
          stage_id: "p-envio",
          pipeline_id: POS,
          organization_id: ORG_ID,
          contact_id: CONTATO,
          status: "open",
          source: "manual",
          external_id: null,
        } as unknown as LeadRow,
      ],
    });
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r).toEqual({
      type: "create_lead_in_pipeline",
      status: "success",
      detail: { reason: "contato_ja_tem_card_aberto", lead_id: "pos-manual" },
    });
    expect(db.escritas.filter((e) => e.table === "crm_leads")).toHaveLength(0);
  });

  it("corrida: o INSERT perde para o índice único e a ação devolve o card vencedor", async () => {
    const chave = chaveDoCard({ leadId: "venda-1" }, POS);
    // O dublê não conhece índice único: a recusa do banco é simulada no INSERT
    // de crm_leads, e o concorrente grava o card vencedor naquele instante.
    const db2 = makeDb({
      pipelines: [funilRow({ id: PIPE, name: "Vendas" }), funilRow({ id: POS, name: "Pós-venda" })],
      stages: [VENDAS_NOVO, VENDAS_PAGO, POS_ENVIO],
      leads: [cardDeVendas()],
      writeError: (_n, tabela) => {
        if (tabela !== "crm_leads") return null;
        db2.tabelas.crm_leads.push({
          id: "pos-concorrente",
          organization_id: ORG_ID,
          pipeline_id: POS,
          source: "automation",
          external_id: chave,
          status: "open",
        });
        // O formato REAL do PostgREST para o 23505 deste índice; o
        // createLeadHandler o embrulha em ApiError(500) levando a mensagem.
        return { code: "23505", message: 'duplicate key value violates unique constraint "uniq_crm_leads_org_source_external"' };
      },
    });
    const r = await executa(ctxDoLead(db2), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r).toEqual({
      type: "create_lead_in_pipeline",
      status: "success",
      detail: { reason: "card_ja_criado", lead_id: "pos-concorrente" },
    });
  });

  it("erro NÃO-23505 no INSERT, mesmo com card da chave aparecendo: FALHA, não vira card_ja_criado (P2-3)", async () => {
    const chave = chaveDoCard({ leadId: "venda-1" }, POS);
    const db2 = makeDb({
      pipelines: [funilRow({ id: PIPE, name: "Vendas" }), funilRow({ id: POS, name: "Pós-venda" })],
      stages: [VENDAS_NOVO, VENDAS_PAGO, POS_ENVIO],
      leads: [cardDeVendas()],
      writeError: (_n, tabela) => {
        if (tabela !== "crm_leads") return null;
        db2.tabelas.crm_leads.push({
          id: "pos-outro",
          organization_id: ORG_ID,
          pipeline_id: POS,
          source: "automation",
          external_id: chave,
          status: "open",
        });
        return {
          code: "23514",
          message: 'new row for relation "crm_leads" violates check constraint "crm_leads_currency_iso"',
        };
      },
    });
    const r = await executa(ctxDoLead(db2), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r.status).toBe("failed");
    expect(r.error).toContain("crm_leads_currency_iso");
    expect(r.detail).toBeUndefined();
  });

  it("ehViolacaoDaChave: reconhece o formato do handler e o do PostgREST cru; recusa o resto", () => {
    const msg = 'duplicate key value violates unique constraint "uniq_crm_leads_org_source_external"';
    expect(ehViolacaoDaChave(new ApiError(500, "internal_error", undefined, "rule:x", msg))).toBe(true);
    expect(ehViolacaoDaChave({ code: "23505", message: msg })).toBe(true);
    expect(ehViolacaoDaChave({ code: "23505", message: "duplicate", details: "Key ... " + msg })).toBe(true);
    // 23505 de OUTRA constraint não é a corrida desta chave.
    expect(
      ehViolacaoDaChave({ code: "23505", message: 'duplicate key value violates unique constraint "crm_leads_pkey"' }),
    ).toBe(false);
    expect(ehViolacaoDaChave(new ApiError(500, "internal_error", undefined, "rule:x", "fetch failed"))).toBe(false);
    expect(ehViolacaoDaChave(new ApiError(422, "validation_failed", undefined, "rule:x"))).toBe(false);
    expect(ehViolacaoDaChave(null)).toBe(false);
  });
});

describe("create_lead_in_pipeline — fronteira de organização e etapa", () => {
  it("funil de OUTRA organização: recusa e não cria nada", async () => {
    const db = banco({ posOrg: OUTRA_ORG });
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r).toEqual({ type: "create_lead_in_pipeline", status: "failed", error: "funil_de_destino_indisponivel" });
    expect(db.escritas).toHaveLength(0);
  });

  it("etapa de OUTRA organização, mesmo com funil próprio: recusa", async () => {
    const db = banco({
      stages: [VENDAS_NOVO, VENDAS_PAGO, { ...POS_ENVIO, organization_id: OUTRA_ORG }],
    });
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r).toEqual({ type: "create_lead_in_pipeline", status: "failed", error: "etapa_de_destino_invalida" });
    expect(db.escritas).toHaveLength(0);
  });

  it("etapa que não é do funil escolhido: recusa", async () => {
    const db = banco();
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "v-novo" });

    expect(r).toMatchObject({ status: "failed", error: "etapa_de_destino_invalida" });
    expect(db.escritas).toHaveLength(0);
  });

  it.each([
    ["ganho", "p-entregue"],
    ["perda", "p-cancelada"],
  ])("etapa de %s no destino: recusa (card não nasce fechado)", async (_nome, stageId) => {
    const db = banco();
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: stageId });

    expect(r).toEqual({ type: "create_lead_in_pipeline", status: "failed", error: "etapa_de_destino_de_fechamento" });
    expect(db.escritas).toHaveLength(0);
  });

  it("destino igual ao funil da origem: recusa", async () => {
    const db = banco();
    const r = await executa(ctxDoLead(db), { pipeline_id: PIPE, stage_id: "v-novo" });

    expect(r).toMatchObject({ status: "failed", error: "destino_e_o_mesmo_funil" });
    expect(db.escritas).toHaveLength(0);
  });

  it("lead do contexto que não é desta organização: recusa sem ler nada dele", async () => {
    const db = banco({ leads: [cardDeVendas({ organization_id: OUTRA_ORG })] });
    const r = await executa(ctxDoLead(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r).toMatchObject({ status: "failed", error: "lead_de_origem_nao_encontrado" });
    expect(db.escritas).toHaveLength(0);
  });

  it("config incompleta: missing_config", async () => {
    const db = banco();
    const r = await executa(ctxDoLead(db), { pipeline_id: POS });
    expect(r).toMatchObject({ status: "failed", error: "missing_config" });
  });
});

describe("create_lead_in_pipeline — gatilho de contato", () => {
  function ctxDoContato(db: ReturnType<typeof makeDb>, eventId = "evento-contato"): ActionCtx {
    return {
      admin: db.client as unknown as ActionCtx["admin"],
      organizationId: ORG_ID,
      ruleId: "regra-contato",
      ruleName: "Tag → Recompra",
      event: { id: eventId } as ActionCtx["event"],
      requestId: eventId,
      context: { contact: { id: CONTATO, name: "Maria" } },
    };
  }

  it("cria o card para o contato, com a chave do EVENTO e sem timeline de origem", async () => {
    const db = banco({ leads: [] });
    const r = await executa(ctxDoContato(db), { pipeline_id: POS, stage_id: "p-envio" });

    expect(r.status).toBe("success");
    expect(novos(db)[0]).toMatchObject({
      contact_id: CONTATO,
      title: "Maria",
      external_id: chaveDoCard({ eventId: "evento-contato" }, POS),
    });
    expect(db.tabelas.crm_lead_activities.map((a) => a.type)).toEqual(["created_from_pipeline"]);
  });

  it("o mesmo evento reprocessado não duplica", async () => {
    const db = banco({ leads: [] });
    await executa(ctxDoContato(db), { pipeline_id: POS, stage_id: "p-envio" });
    await executa(ctxDoContato(db), { pipeline_id: POS, stage_id: "p-envio" });
    expect(novos(db)).toHaveLength(1);
  });
});
