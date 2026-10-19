/**
 * AS DUAS OPÇÕES DA TROCA DE FUNIL (decisão do Peterson, 19/10/2026).
 *
 *   A) "Mover o card" (padrão) ou "Criar card novo" nas duas ações de automação.
 *      Regra salva sem `modo` segue o que sempre fez: `create_or_move_lead`
 *      move, `create_lead_in_pipeline` cria.
 *   B) "Rodar as automações de entrada da etapa" (padrão desligado). Ligada, a
 *      troca emite UM `lead.stage_changed` marcado; o motor roda as regras da
 *      etapa uma vez, e as conversões pulam o evento.
 *
 * Controle negativo em cada bloco: sem a opção, nada de entrada; sem a marca,
 * a conversão segue o caminho normal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  createLeadHandler: vi.fn(),
  moveLeadHandler: vi.fn(),
  moverNegocioDeFunil: vi.fn(),
}));

vi.mock("@/app/api/v1/leads/_handler", () => ({
  createLeadHandler: (...a: unknown[]) => spies.createLeadHandler(...a),
  moveLeadHandler: (...a: unknown[]) => spies.moveLeadHandler(...a),
}));
vi.mock("@/lib/leads/mover-de-funil", () => ({
  moverNegocioDeFunil: (...a: unknown[]) => spies.moverNegocioDeFunil(...a),
}));
vi.mock("@/lib/atendimento/origem-automacao", () => ({ originFromAutomationEvent: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { getAction, registerAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/create-or-move-lead";
import "@/lib/automation/actions/create-lead-in-pipeline";
import { runAutomationForEvent } from "@/lib/automation/engine";
import type { ActionCtx, ActionExecutor } from "@/lib/automation/types";
import { conversaoDeVendaHandler } from "@/lib/conversoes/envio.handler";
import { conversaoDeQualificacaoHandler } from "@/lib/conversoes/qualificacao.handler";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { MARCA_DA_ENTRADA } from "@/lib/leads/entrada-pela-troca";

const FUNIL_DA_REGRA = "f0f0f0f0-0000-0000-0000-000000000002";
const OUTRO_FUNIL = "f0f0f0f0-0000-0000-0000-000000000003";
const ETAPA = "e0e0e0e0-0000-0000-0000-000000000002";
const NEGOCIO = { id: "lead-1", pipeline_id: OUTRO_FUNIL, stage_id: "e-velha", status: "won", contact_id: "c-1" };

/** Admin mínimo: toda leitura por id devolve o negócio; o resto, nada. */
function admin() {
  return {
    from() {
      const filtros: Record<string, unknown> = {};
      const api: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "neq", "is"]) api[m] = () => api;
      api.eq = (c: string, v: unknown) => ((filtros[c] = v), api);
      api.maybeSingle = async () => ({ data: filtros.id ? NEGOCIO : null, error: null });
      return api;
    },
  };
}

function ctx(metadata: Record<string, unknown> = {}): ActionCtx {
  return {
    admin: admin(),
    organizationId: "org-1",
    ruleId: "regra-1",
    ruleName: "Ganho vai para o pós-venda",
    event: { id: "evt-1", metadata },
    context: { lead: { id: NEGOCIO.id, pipeline_id: OUTRO_FUNIL } },
    requestId: "evt-1",
  } as unknown as ActionCtx;
}

const BASE = { pipeline_id: FUNIL_DA_REGRA, stage_id: ETAPA };
const destinoDaTroca = () => spies.moverNegocioDeFunil.mock.calls[0]?.[3] as Record<string, unknown>;

beforeEach(() => {
  for (const s of Object.values(spies)) s.mockReset();
  spies.moverNegocioDeFunil.mockResolvedValue({ ok: true, lead: { ...NEGOCIO, pipeline_id: FUNIL_DA_REGRA } });
});

describe("create_or_move_lead — modo e entrada", () => {
  it("regra antiga (sem modo, sem opção): move e NÃO roda as automações de entrada", async () => {
    const r = await getAction("create_or_move_lead")!.execute(ctx(), BASE);
    expect(r.status).toBe("success");
    expect(spies.moverNegocioDeFunil).toHaveBeenCalledTimes(1);
    expect(destinoDaTroca().rodarAutomacoesDeEntrada).toBe(false);
  });

  it("opção ligada: a troca pede a entrada", async () => {
    await getAction("create_or_move_lead")!.execute(ctx(), { ...BASE, rodar_automacoes_de_entrada: true });
    expect(destinoDaTroca().rodarAutomacoesDeEntrada).toBe(true);
  });

  it("anti-laço: regra que rodou por uma entrada pedida por OUTRA regra não encadeia outra", async () => {
    const encadeado = ctx({ [MARCA_DA_ENTRADA]: true, troca_por_regra: "regra-0" });
    await getAction("create_or_move_lead")!.execute(encadeado, { ...BASE, rodar_automacoes_de_entrada: true });
    expect(destinoDaTroca().rodarAutomacoesDeEntrada).toBe(false);
  });

  it("'Criar card novo': não move, delega à criação de create_lead_in_pipeline", async () => {
    const real = getAction("create_lead_in_pipeline")!;
    const criar = vi.fn(async () => ({ type: "create_lead_in_pipeline", status: "success" as const }));
    registerAction({ type: "create_lead_in_pipeline", execute: criar } as ActionExecutor);
    try {
      const r = await getAction("create_or_move_lead")!.execute(ctx(), { ...BASE, modo: "criar" });
      expect(r).toMatchObject({ type: "create_or_move_lead", status: "success" });
      expect(criar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ modo: "criar" }));
      expect(spies.moverNegocioDeFunil).not.toHaveBeenCalled();
    } finally {
      registerAction(real);
    }
  });
});

describe("create_lead_in_pipeline — padrão da regra salva antes da opção", () => {
  it("modo 'mover' (regra nova): move o mesmo card, com a opção de entrada", async () => {
    const r = await getAction("create_lead_in_pipeline")!.execute(ctx(), {
      ...BASE,
      modo: "mover",
      rodar_automacoes_de_entrada: true,
    });
    expect(r).toMatchObject({ type: "create_lead_in_pipeline", status: "success" });
    expect(spies.moverNegocioDeFunil).toHaveBeenCalledTimes(1);
    expect(destinoDaTroca().rodarAutomacoesDeEntrada).toBe(true);
    expect(spies.createLeadHandler).not.toHaveBeenCalled();
  });

  it("CONTROLE: regra antiga (sem modo) NÃO move — segue criando card novo", async () => {
    await getAction("create_lead_in_pipeline")!.execute(ctx(), BASE);
    expect(spies.moverNegocioDeFunil).not.toHaveBeenCalled();
  });
});

describe("motor: a entrada marcada roda as regras da etapa UMA vez", () => {
  const rodou = vi.fn();
  registerAction({
    type: "teste_entrada",
    execute: async () => (rodou(), { type: "teste_entrada", status: "success" as const }),
  });
  const REGRA = { id: "r-etapa", name: "Entrou em Pós-venda", conditions: [], actions: [{ type: "teste_entrada" }] };

  function db() {
    const client = {
      from: (tabela: string) => {
        const e: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit", "update", "insert"]) e[m] = () => e;
        const dados = tabela === "automation_rules" ? [REGRA] : null;
        e.maybeSingle = async () => ({ data: null, error: null });
        e.then = (fn: (r: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(fn);
        return e;
      },
      rpc: async () => ({ data: null, error: null }),
    };
    return client as never;
  }
  const evento = (metadata: Record<string, unknown>): EventRow => ({
    id: "evt-9",
    organization_id: "org-1",
    event_type: "lead.stage_changed",
    entity_kind: "crm_lead",
    entity_id: "lead-1",
    payload: { to_stage_id: ETAPA },
    metadata,
    consumed_by: [],
    attempts: 0,
  });

  beforeEach(() => rodou.mockReset());

  it("evento da troca pedida por regra (request_id `troca:`) roda a regra uma vez", async () => {
    await runAutomationForEvent(db(), evento({ [MARCA_DA_ENTRADA]: true, troca_por_regra: "r0", request_id: "troca:r0" }));
    expect(rodou).toHaveBeenCalledTimes(1);
  });

  it("CONTROLE: o mesmo evento com o prefixo `rule:` seria pulado (por isso o prefixo é outro)", async () => {
    await runAutomationForEvent(db(), evento({ [MARCA_DA_ENTRADA]: true, request_id: "rule:r0" }));
    expect(rodou).not.toHaveBeenCalled();
  });
});

describe("conversões não saem pela entrada da troca", () => {
  const marcado = {
    id: "evt-1",
    organization_id: "org-1",
    event_type: "lead.stage_changed",
    entity_kind: "crm_lead",
    entity_id: "lead-1",
    payload: { to_stage_id: ETAPA },
    metadata: { [MARCA_DA_ENTRADA]: true },
    consumed_by: [],
    attempts: 0,
  } as EventRow;

  it.each([
    ["venda", conversaoDeVendaHandler],
    ["qualificação", conversaoDeQualificacaoHandler],
  ])("%s pula o evento marcado sem ler nada", async (_n, handler) => {
    const r = await handler.handle(marcado);
    expect(r).toMatchObject({ status: "skipped", detail: "entrada_pela_troca_de_funil" });
  });
});
