import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HandlerCtx } from "@/lib/api/handlers/types";
import { ApiError } from "@/lib/api/types";

// A troca de funil é o EFEITO observável: mockada aqui, e SEMPRE a mesma que a
// tela e a automação chamam (`moverNegocioDeFunil`, 9053) — se este teste
// passasse com outra implementação, seria papel no lugar do defeito (#2155).
// Divergência Tektus: a troca MOVE o mesmo card, nunca clona.
vi.mock("@/lib/leads/mover-de-funil", () => ({
  moverNegocioDeFunil: vi.fn(async () => ({ ok: true, lead: { id: "lead-1" } })),
}));

// O card adicional (consórcio ↔ investimentos) tem o arquivo próprio
// `destino-da-intencao-produtos.test.ts`; aqui só não pode arrastar o handler de
// leads (e o `.env`) para dentro do teste.
vi.mock("@/lib/leads/abre-card-adicional", () => ({
  abreCardAdicionalNoFunil: vi.fn(),
}));

import { moverNegocioDeFunil } from "@/lib/leads/mover-de-funil";

import { TITULO_AVISO_DE_DESTINO_RECUSADO, tituloDoAvisoDeDestinoRecusado } from "./aviso-de-destino-recusado";
import { aplicaDestinoDaIntencao } from "./destino-da-intencao";

const transferir = vi.mocked(moverNegocioDeFunil);

const handlerCtx: HandlerCtx = {
  organization_id: "org-1",
  actor: { type: "ai_agent", id: "job-1", role: "ai_operator", agent_id: "agent-vendas" },
  requestId: "job-1",
};

/** Supabase fake: `from().select().eq().eq().eq()` resolve com as linhas dadas. */
function adminCom(linhas: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ eq: async () => ({ data: linhas, error: null }) }) }),
      }),
    }),
  } as never;
}

function negocio(id: string, pipeline: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: "org-1",
    pipeline_id: pipeline,
    status: "open",
    contact_id: "c1",
    last_activity_at: "2026-10-04T12:00:00+00:00",
    created_at: "2026-10-01T12:00:00+00:00",
    title: "Negócio",
    description: null,
    value_cents: null,
    currency: "BRL",
    owner_user_id: null,
    owner_agent_id: null,
    expected_close_date: null,
    tags: [],
    source: null,
    custom_fields: {},
    source_metadata: {},
    ...extra,
  };
}

function deps(admin: never, destinoPipelineId = "pipe-b", destinoStageId: string | null = "stage-b1") {
  return {
    admin,
    organizationId: "org-1",
    contactId: "c1",
    destinoPipelineId,
    destinoStageId,
    handlerCtx,
  };
}

describe("aplicaDestinoDaIntencao (#2155 — o card vai para o funil da intenção)", () => {
  beforeEach(() => transferir.mockClear());

  it("card no funil de ENTRADA, destino declarado → transfere para o funil destino", async () => {
    const r = await aplicaDestinoDaIntencao(deps(adminCom([negocio("lead-1", "pipe-entrada")])));

    expect(r.status).toBe("transferido");
    expect(r.origemId).toBe("lead-1");
    // MOVE o mesmo card: não há clone.
    expect(r.cloneId).toBeUndefined();
    expect(transferir).toHaveBeenCalledTimes(1);
    // O QUE prende o defeito: destino É o funil da intenção, nunca o de entrada.
    expect(transferir.mock.calls[0]![2]).toMatchObject({ id: "lead-1", pipeline_id: "pipe-entrada" });
    expect(transferir.mock.calls[0]![3]).toMatchObject({
      pipelineId: "pipe-b",
      stageId: "stage-b1",
      origemDaChamada: "lib/agent-engine/agent/destino-da-intencao",
    });
  });

  it("card JÁ no funil destino → nada a fazer (idempotente em toda mensagem seguinte)", async () => {
    const r = await aplicaDestinoDaIntencao(deps(adminCom([negocio("lead-1", "pipe-b")])));

    expect(r.status).toBe("ja_no_destino");
    expect(transferir).not.toHaveBeenCalled();
  });

  it("destino já com OUTRO negócio aberto → não duplica o card do cliente", async () => {
    const r = await aplicaDestinoDaIntencao(
      deps(adminCom([negocio("lead-1", "pipe-entrada"), negocio("lead-2", "pipe-b")])),
    );

    expect(r.status).toBe("destino_ocupado");
    expect(transferir).not.toHaveBeenCalled();
  });

  it("sem negócio aberto → sem card a mover, nunca lança", async () => {
    const r = await aplicaDestinoDaIntencao(deps(adminCom([])));

    expect(r.status).toBe("sem_negocio");
    expect(transferir).not.toHaveBeenCalled();
  });

  it("a transferência recusou (etapa de outro funil) → recusado com o código, sem exceção", async () => {
    transferir.mockResolvedValueOnce({ ok: false, status: 422, code: "stage_pipeline_mismatch", texto: "" });

    const r = await aplicaDestinoDaIntencao(deps(adminCom([negocio("lead-1", "pipe-entrada")])));

    expect(r.status).toBe("recusado");
    expect(r.error).toBe("stage_pipeline_mismatch");
  });

  it("sem etapa declarada → manda null e a transferência escolhe a primeira aberta", async () => {
    await aplicaDestinoDaIntencao(
      deps(adminCom([negocio("lead-1", "pipe-entrada")]), "pipe-b", null),
    );

    expect(transferir.mock.calls[0]![3]).toMatchObject({ stageId: null });
  });
});

// ─── #2297, caminho 1: a recusa da régua NÃO morre no `runLog.warn` ─────────
//
// Com a régua na criação, `transfereParaOFunil` LANÇA quando a etapa de destino
// exige campo em branco: o 422 `required_fields_missing` do `createLeadHandler`
// sobe intacto. Antes do conserto a exceção subia até o `catch` de
// `inbound-turn.ts` — que faz certo em não derrubar a resposta ao lead, mas só
// conseguia um `runLog.warn`: negócio de origem aberto (nada se perde) e
// ninguém sabendo. Agora `aplicaDestinoDaIntencao` captura, devolve `recusado`
// com o MESMO código e abre o aviso na Central apontando para o negócio de
// origem — o único id que ele conhece e o `catch` de inbound não conhecia.
//
// Sabotagens que separam os desenhos: tirar o `.catch` faz o primeiro caso
// LANÇAR (vermelho por exceção); tirar a chamada do aviso deixa os dois
// primeiros sem item inserido. O último caso é o controle — um aviso na
// transferência que PASSA transformaria a Central em ruído.

/** Supabase com as duas superfícies: leitura de negócio E escrita de aviso. */
function adminComAvisos(
  linhas: unknown[],
  { jaAberto = false, locale = null }: { jaAberto?: boolean; locale?: string | null } = {},
) {
  const inseridos: Record<string, unknown>[] = [];
  const from = (tabela: string) => {
    if (tabela === "organizations") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { locale }, error: null }) }) }),
      };
    }
    if (tabela !== "agent_inbox_items") {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ eq: async () => ({ data: linhas, error: null }) }) }),
        }),
      };
    }
    const cadeia: Record<string, unknown> = {};
    const encadeia = () => cadeia;
    for (const nome of ["select", "eq", "limit"]) cadeia[nome] = encadeia;
    cadeia.maybeSingle = async () => ({ data: jaAberto ? { id: "aviso-aberto" } : null, error: null });
    cadeia.insert = (linha: Record<string, unknown>) => {
      inseridos.push(linha);
      return { error: null };
    };
    return cadeia;
  };
  return { cliente: { from } as never, inseridos };
}

describe("recusa da transferência abre o aviso na Central (#2297, caminho 1)", () => {
  it("a régua LANÇA → recusado com o código, origem apontada e aviso aberto", async () => {
    transferir.mockRejectedValueOnce(
      new ApiError(422, "required_fields_missing", { faltando: [] }, "job-1", "Preencha os campos"),
    );
    const { cliente, inseridos } = adminComAvisos([negocio("lead-1", "pipe-entrada")]);

    const r = await aplicaDestinoDaIntencao(deps(cliente));

    expect(r.status).toBe("recusado");
    expect(r.error).toBe("required_fields_missing");
    expect(r.origemId).toBe("lead-1");
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]).toMatchObject({
      organization_id: "org-1",
      kind: "other",
      severity: "warn",
      ref_kind: "lead",
      ref_id: "lead-1",
      title: TITULO_AVISO_DE_DESTINO_RECUSADO,
    });
    expect(String(inseridos[0]!.body)).toContain("campos obrigatórios");
  });

  it("a recusa que NÃO lança ({ok:false}) abre o MESMO aviso", async () => {
    transferir.mockResolvedValueOnce({ ok: false, status: 422, code: "origem_sem_etapa_de_perda", texto: "" });
    const { cliente, inseridos } = adminComAvisos([negocio("lead-1", "pipe-entrada")]);

    const r = await aplicaDestinoDaIntencao(deps(cliente));

    expect(r.status).toBe("recusado");
    expect(inseridos).toHaveLength(1);
    expect(String(inseridos[0]!.body)).toContain("origem_sem_etapa_de_perda");
  });

  it("já existe aviso aberto para este negócio → não empilha o segundo", async () => {
    transferir.mockResolvedValueOnce({ ok: false, status: 422, code: "required_fields_missing", texto: "" });
    const { cliente, inseridos } = adminComAvisos([negocio("lead-1", "pipe-entrada")], {
      jaAberto: true,
    });

    const r = await aplicaDestinoDaIntencao(deps(cliente));

    expect(r.status).toBe("recusado");
    expect(inseridos).toHaveLength(0);
  });

  it("transferência que PASSA → nenhum aviso (controle)", async () => {
    const { cliente, inseridos } = adminComAvisos([negocio("lead-1", "pipe-entrada")]);

    const r = await aplicaDestinoDaIntencao(deps(cliente));

    expect(r.status).toBe("transferido");
    expect(inseridos).toHaveLength(0);
  });

  it("organização em espanhol → título e corpo em espanhol, e a dedup compara o título traduzido", async () => {
    transferir.mockRejectedValueOnce(
      new ApiError(422, "required_fields_missing", { faltando: [] }, "job-1", "Preencha os campos"),
    );
    const { cliente, inseridos } = adminComAvisos([negocio("lead-1", "pipe-entrada")], { locale: "es" });

    await aplicaDestinoDaIntencao(deps(cliente));

    expect(tituloDoAvisoDeDestinoRecusado("es")).not.toBe(TITULO_AVISO_DE_DESTINO_RECUSADO);
    expect(inseridos[0]!.title).toBe(tituloDoAvisoDeDestinoRecusado("es"));
    expect(String(inseridos[0]!.body)).toContain("campos obligatorios");
  });

  it("falha que NÃO é a régua volta ao chamador, sem aviso", async () => {
    // Um aviso dizendo "não move nada" para uma falha que não é recusa seria
    // falso. A falha sobe ao `catch` de `inbound-turn.ts`.
    transferir.mockRejectedValueOnce(
      new ApiError(422, "lost_reason_invalid", undefined, "job-1", "Motivo fora da lista"),
    );
    const { cliente, inseridos } = adminComAvisos([negocio("lead-1", "pipe-entrada")]);

    await expect(aplicaDestinoDaIntencao(deps(cliente))).rejects.toMatchObject({ code: "lost_reason_invalid" });
    expect(inseridos).toHaveLength(0);
  });
});
