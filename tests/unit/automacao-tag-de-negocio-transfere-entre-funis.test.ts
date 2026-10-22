/**
 * O GATILHO `lead.tag_added` COM O NEGÓCIO EM OUTRO FUNIL: A REGRA TRANSFERE (#2155).
 *
 * ═══ O defeito, medido na instalação real da issue ═══
 *
 * Três funis (Recepção = entrada, e os de produto), um agente por funil e um
 * roteador no número. A regra "Recepção → Funil X", de gatilho `lead.tag_added`
 * e ação `create_or_move_lead`, deveria levar o card ao funil do produto — e as
 * duas regras ficavam com `run_count = 0`.
 *
 * O motivo é um galho da própria ação: quando o evento TRAZ o negócio
 * (`context.lead`), `create_or_move_lead` compara `lead.pipeline_id` com o
 * funil da regra e devolve `failed / cross_pipeline_move_not_allowed` antes de
 * qualquer coisa (lib/automation/actions/create-or-move-lead.ts, ramo `if
 * (lead)`). O caminho que TRANSFERE — `transfereParaOFunil`, o mesmo da rota
 * `/clone` — só é alcançável pelo ramo POR CONTATO, que é justamente o ramo que
 * roda quando o evento NÃO traz o negócio. O desenho "a Recepção etiqueta, a
 * regra transfere" ficava sem saída no único caso em que ele existe.
 *
 * ═══ O que este arquivo vigia ═══
 *
 * A nova regra, e o escopo estreito dela: COM o negócio no evento, gatilho
 * `lead.tag_added` e funil de destino diferente, a ação TRANSFERE — clona para
 * o funil da regra (`montaPayloadDoClone`) e encerra a origem como perdida com
 * o motivo da transferência —; e o CLONE é o negócio que as ações seguintes da
 * mesma regra enxergam (`publicaNoContexto`).
 *
 * Dois controles prendem que nada ao redem mudou: negócio já no funil da regra
 * continua sendo movido de etapa (a operação comum de um funil só), e evento
 * SEM negócio continua caindo no ramo de contato de sempre. Um terceiro
 * controla o ESCOPO declarado: qualquer outro gatilho que traga o negócio
 * (`lead.stage_changed`, `lead.created`, …) segue recusando, porque a proposta
 * principal da #2155 — `pipeline_id`/`stage_id` em `ai_router_members` —
 * exige migration e não entra aqui.
 *
 * ═══ No fork, desde a 9053 (decisão do Peterson de 19/10/2026) ═══
 *
 * A troca de funil MOVE o MESMO card (`moverNegocioDeFunil`, o caminho da rota
 * da tela): nada de clone, nada de origem encerrada como "Levado para outro
 * funil", e vale para qualquer gatilho que traga o negócio. Os três casos de
 * troca abaixo medem isso; os controles (mesmo funil move de etapa, sem negócio
 * cria) seguem os do upstream. O irmão `automacao-troca-de-funil-transfere-o-negocio`
 * cobre a troca pelo ramo de contato.
 */
import { describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  createLeadHandler: vi.fn(),
  moveLeadHandler: vi.fn(),
  encerraDemanda: vi.fn(),
  moverNegocioDeFunil: vi.fn(),
}));

vi.mock("@/app/api/v1/leads/_handler", () => ({
  createLeadHandler: (...args: unknown[]) => spies.createLeadHandler(...args),
  moveLeadHandler: (...args: unknown[]) => spies.moveLeadHandler(...args),
}));

vi.mock("@/lib/leads/encerramento", () => ({
  encerraDemanda: (...args: unknown[]) => spies.encerraDemanda(...args),
}));

vi.mock("@/lib/leads/mover-de-funil", () => ({
  moverNegocioDeFunil: (...args: unknown[]) => spies.moverNegocioDeFunil(...args),
}));

vi.mock("@/lib/atendimento/origem-automacao", () => ({
  originFromAutomationEvent: async () => null,
}));

import { getAction } from "@/lib/automation/actions";
import { MOTIVO_PADRAO_DA_TROCA } from "@/lib/leads/motivo-da-perda";
import type { ActionCtx } from "@/lib/automation/types";
import type { EventRow } from "@/lib/event-log/dispatcher";

import "@/lib/automation/actions/create-or-move-lead";

const MOTIVO_DA_TRANSFERENCIA = "moved_to_another_pipeline";

const ORG = "11111111-1111-1111-1111-111111111111";
const CONTATO = "c0c0c0c0-0000-0000-0000-000000000001";
/** O funil de ENTRADA — onde o card nasce e onde a condição da regra o acha. */
const FUNIL_A = "f0f0f0f0-0000-0000-0000-00000000000a";
/** O funil de DESTINO — o que a regra `lead.tag_added` aponta. */
const FUNIL_B = "f0f0f0f0-0000-0000-0000-00000000000b";
const ETAPA_DO_FUNIL_A = "e0e0e0e0-0000-0000-0000-00000000000a";
const ETAPA_INICIAL_DO_B = "e0e0e0e0-0000-0000-0000-0000000000b1";
const ETAPA_ESCOLHIDA = "e0e0e0e0-0000-0000-0000-0000000000b2";
const ETAPA_DE_PERDA_DO_A = "e0e0e0e0-0000-0000-0000-000000000ff";

const TITULO_DA_ORIGEM = "Aporte mensal em ações";

/** A linha COMPLETA de `crm_leads` — é o que `buildContext` põe em `context.lead`. */
const NEGOCIO_NO_FUNIL_A = {
  id: "1ea1-0000-0000-0000-000000000001",
  pipeline_id: FUNIL_A,
  stage_id: ETAPA_DO_FUNIL_A,
  status: "open",
  title: TITULO_DA_ORIGEM,
  description: "Cliente pediu simulação",
  contact_id: CONTATO,
  value_cents: 150000,
  currency: "BRL",
  owner_user_id: null,
  owner_agent_id: null,
  expected_close_date: null,
  tags: ["intencao-b"],
  source: "whatsapp",
  custom_fields: { canal: "rotativo" },
  source_metadata: {},
};

const ETAPAS_DO_FUNIL_B = [
  {
    id: ETAPA_INICIAL_DO_B,
    pipeline_id: FUNIL_B,
    position: 1,
    is_won: false,
    is_lost: false,
    is_archived: false,
  },
  {
    id: ETAPA_ESCOLHIDA,
    pipeline_id: FUNIL_B,
    position: 2,
    is_won: false,
    is_lost: false,
    is_archived: false,
  },
];

/** O suficiente do client admin para as leituras que a ação faz. */
function adminFalso(cenarios: {
  negocioNoFunilDaRegra?: unknown;
  negocioEmOutroFunil?: unknown;
  etapasDoDestino?: unknown;
  etapaDePerda?: unknown;
}) {
  return {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const api: Record<string, unknown> = {};
      const mesmo = () => api;
      api.select = mesmo;
      api.order = mesmo;
      api.limit = mesmo;
      api.eq = (coluna: string, valor: unknown) => {
        filtros[coluna] = valor;
        return api;
      };
      api.neq = (coluna: string, valor: unknown) => {
        filtros[`neq:${coluna}`] = valor;
        return api;
      };
      const resposta = () => {
        if (tabela === "crm_leads") {
          if (filtros["neq:pipeline_id"]) return cenarios.negocioEmOutroFunil ?? null;
          return cenarios.negocioNoFunilDaRegra ?? null;
        }
        if (tabela === "crm_stages") {
          if (filtros.is_lost === true) return cenarios.etapaDePerda ?? null;
          return cenarios.etapasDoDestino ?? null;
        }
        return null;
      };
      const terminal = async () => ({ data: resposta(), error: null });
      api.maybeSingle = terminal;
      api.single = terminal;
      api.then = (resolver: (valor: unknown) => unknown) => terminal().then(resolver);
      return api;
    },
  };
}

/** O evento que o motor entrega — `lead.tag_added` é de negócio (`crm_lead`). */
function evento(tipo: string): EventRow {
  return {
    id: "7e7e7e7e-0000-0000-0000-000000000001",
    organization_id: ORG,
    event_type: tipo,
    entity_kind: "crm_lead",
    entity_id: NEGOCIO_NO_FUNIL_A.id,
    payload: { tag: "intencao-b" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  } as EventRow;
}

function contexto(
  cenarios: Parameters<typeof adminFalso>[0] = {},
  opcoes: { tipoDoEvento?: string; comNegocio?: boolean } = {},
): ActionCtx {
  const context: Record<string, unknown> = {
    contact: { id: CONTATO, name: "Helena Barros", phone_number: "+551****0001" },
  };
  if (opcoes.comNegocio !== false) context.lead = NEGOCIO_NO_FUNIL_A;
  return {
    admin: adminFalso(cenarios),
    organizationId: ORG,
    ruleId: "r0r0r0r0-0000-0000-0000-000000000001",
    ruleName: "Recepção → Funil B",
    event: evento(opcoes.tipoDoEvento ?? "lead.tag_added"),
    context,
    requestId: "rule:r0r0r0r0-0000-0000-0000-000000000001",
  } as unknown as ActionCtx;
}

const CONFIG = { pipeline_id: FUNIL_B, stage_id: ETAPA_ESCOLHIDA };

const CENARIOS_DA_TRANSFERENCIA = {
  etapasDoDestino: ETAPAS_DO_FUNIL_B,
  etapaDePerda: { id: ETAPA_DE_PERDA_DO_A },
};

/** O TERCEIRO argumento de uma chamada (admin, ctx, payload) — sem `[0][2]` solto. */
function argumentoDaChamada(
  spy: { mock: { calls: unknown[][] } },
  indice = 0,
): Record<string, unknown> {
  const chamada = spy.mock.calls[indice];
  expect(chamada).toBeDefined();
  return (chamada as unknown[])[2] as Record<string, unknown>;
}

function limpaOsSpies(): void {
  spies.createLeadHandler.mockReset();
  spies.moveLeadHandler.mockReset();
  spies.encerraDemanda.mockReset();
  spies.moverNegocioDeFunil.mockReset();
}

/** A troca devolve o MESMO card, agora morando no funil de destino. */
function trocaMove(pipelineId: string, stageId: string) {
  spies.moverNegocioDeFunil.mockImplementation(async () => ({
    ok: true,
    lead: { ...NEGOCIO_NO_FUNIL_A, pipeline_id: pipelineId, stage_id: stageId },
  }));
}

/** `leDoBanco` relê o negócio pelo id antes de mover (ramo `if (lead)`). */
const CENARIOS_DA_TROCA = { ...CENARIOS_DA_TRANSFERENCIA, negocioNoFunilDaRegra: NEGOCIO_NO_FUNIL_A };

describe("create_or_move_lead — o gatilho lead.tag_added transfere o negócio de funil", () => {
  it("O DEFEITO (#2155): negócio no funil A + gatilho lead.tag_added leva o MESMO card ao funil B (9053)", async () => {
    limpaOsSpies();
    trocaMove(FUNIL_B, ETAPA_ESCOLHIDA);

    const ctx = contexto(CENARIOS_DA_TROCA);
    const acao = getAction("create_or_move_lead");
    const resultado = await acao!.execute(ctx, CONFIG);

    expect(resultado.status).toBe("success");
    expect(resultado.error).toBeUndefined();
    expect(resultado.detail).toEqual({ moved: NEGOCIO_NO_FUNIL_A.id, pipeline_id: FUNIL_B });

    // O mesmo card, pelo caminho da rota da tela, para a etapa escolhida.
    expect(spies.moverNegocioDeFunil).toHaveBeenCalledTimes(1);
    const [, , negocio, destino] = spies.moverNegocioDeFunil.mock.calls[0] as unknown[];
    expect((negocio as { id: string }).id).toBe(NEGOCIO_NO_FUNIL_A.id);
    expect(destino).toMatchObject({ pipelineId: FUNIL_B, stageId: ETAPA_ESCOLHIDA });

    // Nada de clone nem de perda "Levado para outro funil".
    expect(spies.createLeadHandler).not.toHaveBeenCalled();
    expect(spies.encerraDemanda).not.toHaveBeenCalled();
    expect(spies.moveLeadHandler).not.toHaveBeenCalled();

    // As próximas ações da regra enxergam o MESMO card, já no funil B.
    const publicado = (ctx.context.lead ?? {}) as Record<string, unknown>;
    expect(publicado.id).toBe(NEGOCIO_NO_FUNIL_A.id);
    expect(publicado.pipeline_id).toBe(FUNIL_B);
  });

  it("CONTROLE: negócio já no funil da regra continua sendo movido de etapa — igual a hoje", async () => {
    limpaOsSpies();
    spies.moveLeadHandler.mockResolvedValue({ id: NEGOCIO_NO_FUNIL_A.id, pipeline_id: FUNIL_B });

    const ctx = contexto({
      ...CENARIOS_DA_TRANSFERENCIA,
      negocioNoFunilDaRegra: { id: NEGOCIO_NO_FUNIL_A.id },
    });
    // O MESMO lead, só que já morando no funil B.
    ctx.context.lead = { ...NEGOCIO_NO_FUNIL_A, pipeline_id: FUNIL_B };
    const acao = getAction("create_or_move_lead");
    const resultado = await acao!.execute(ctx, CONFIG);

    expect(resultado.status).toBe("success");
    expect(spies.moveLeadHandler).toHaveBeenCalledTimes(1);
    expect(spies.createLeadHandler).not.toHaveBeenCalled();
    expect(spies.encerraDemanda).not.toHaveBeenCalled();
  });

  it("CONTROLE: sem negócio no evento, o comportamento de hoje não muda — cria", async () => {
    limpaOsSpies();
    spies.createLeadHandler.mockResolvedValue({ id: "novo-tag-0001", contact_id: CONTATO });

    const ctx = contexto({ ...CENARIOS_DA_TRANSFERENCIA, etapaDePerda: null }, { comNegocio: false });
    const acao = getAction("create_or_move_lead");
    const resultado = await acao!.execute(ctx, CONFIG);

    expect(resultado.status).toBe("success");
    expect(spies.createLeadHandler).toHaveBeenCalledTimes(1);
    const payload = argumentoDaChamada(spies.createLeadHandler);
    expect(payload.pipeline_id).toBe(FUNIL_B);
    expect(payload.source).toBe("automation");
    expect(payload.title).toBe("Helena Barros");
    expect(payload.source_metadata).toBeUndefined();
    expect(spies.moveLeadHandler).not.toHaveBeenCalled();
    expect(spies.encerraDemanda).not.toHaveBeenCalled();
  });

  it("outro gatilho com o negócio em outro funil também MOVE o mesmo card (a 9053 vale para todo gatilho)", async () => {
    limpaOsSpies();
    trocaMove(FUNIL_B, ETAPA_ESCOLHIDA);

    const ctx = contexto(CENARIOS_DA_TROCA, { tipoDoEvento: "lead.stage_changed" });
    const acao = getAction("create_or_move_lead");
    const resultado = await acao!.execute(ctx, CONFIG);

    expect(resultado.status).toBe("success");
    expect(spies.moverNegocioDeFunil).toHaveBeenCalledTimes(1);
    expect(spies.createLeadHandler).not.toHaveBeenCalled();
    expect(spies.moveLeadHandler).not.toHaveBeenCalled();
    expect(spies.encerraDemanda).not.toHaveBeenCalled();
  });

  it("duas regras opostas no MESMO evento (A→B→A) movem o mesmo card duas vezes e nunca abrem um segundo", async () => {
    // O motor passa o MESMO `context` a todas as regras aplicáveis de um evento
    // (`engine.ts`). No upstream a 2ª regra era recusada para o clone não voltar;
    // no fork não há clone: a 2ª parte do card já movido, e o resultado é UM
    // card, no funil da última regra. Os eventos derivados saem com `rule:` e o
    // motor não os reprocessa (anti-laço de profundidade 1).
    limpaOsSpies();
    const ctx = contexto(CENARIOS_DA_TROCA);
    const acao = getAction("create_or_move_lead");

    trocaMove(FUNIL_B, ETAPA_ESCOLHIDA);
    const primeira = await acao!.execute(ctx, CONFIG);
    trocaMove(FUNIL_A, ETAPA_DO_FUNIL_A);
    const segunda = await acao!.execute(ctx, { pipeline_id: FUNIL_A, stage_id: ETAPA_DO_FUNIL_A });

    expect(primeira.status).toBe("success");
    expect(segunda.status).toBe("success");
    expect(spies.moverNegocioDeFunil).toHaveBeenCalledTimes(2);
    const ids = spies.moverNegocioDeFunil.mock.calls.map((c) => (c[2] as { id: string }).id);
    expect(ids).toEqual([NEGOCIO_NO_FUNIL_A.id, NEGOCIO_NO_FUNIL_A.id]);
    expect(spies.createLeadHandler).not.toHaveBeenCalled();
    expect(spies.encerraDemanda).not.toHaveBeenCalled();
    expect((ctx.context.lead as Record<string, unknown>).id).toBe(NEGOCIO_NO_FUNIL_A.id);
  });

  it("o motivo da transferência segue sendo o canônico, não perda comercial", () => {
    expect(MOTIVO_PADRAO_DA_TROCA).toBe(MOTIVO_DA_TRANSFERENCIA);
  });
});
