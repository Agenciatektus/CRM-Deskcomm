/**
 * O turno de CLASSIFICAR sem resposta nova do lead não conclui o passo.
 *
 * O nó "Classificar (IA)" enfileira o turno na 1ª entrada, segundos depois do
 * envio. Até o conserto, esse turno via "nenhuma inbound depois do último
 * envio", concluía com `classified: no_reply` e a ponte avançava o fluxo pela
 * saída "sem resposta" — a carência do nó (24 h, no fluxo típico) nunca corria.
 *
 * `no_reply` é decisão do MOTOR quando a carência vence
 * (`case "ai_classify"` em lib/followup/node-handlers.ts). O turno, sem o que
 * classificar, termina sem chamar o modelo e sem chamar a ponte. A prova contra
 * Postgres real, pelo motor inteiro, é
 * `tests/invariants/followup-classificar-espera-a-resposta.test.ts`; aqui fica o
 * ramo do handler, que roda no `verify`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobRow } from "@/lib/agent-engine/queue/queue";

const getLeadContext = vi.fn();
const runModelCall = vi.fn();

vi.mock("@/lib/agent-engine/edge/crm/get-lead-context", () => ({ getLeadContext }));
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({ runModelCall }));

const ORG = "org-1";
const LEAD = "lead-1";
const CONVERSA = "conversa-1";
const boundary = { organization_id: ORG, contact_id: LEAD, conversation_id: CONVERSA, service_revision: 1, demanda_id: null, demanda_revision: null };

const job = {
  id: "job-1",
  organization_id: ORG,
  contact_id: LEAD,
  kind: "followup_turn",
  source_event_id: null,
  payload: {
    service_boundary: boundary,
    followup_enrollment_id: "7d4f1c2a-0b1e-4c5d-9e8f-1a2b3c4d5e6f",
    node_id: "c1",
    purpose: "classify",
    classes: ["quer", "não quer"],
  },
  status: "running",
  priority: 0,
  run_after: new Date(),
  attempts: 1,
  max_attempts: 3,
  last_error: null,
  locked_by: "w1",
  locked_at: new Date(),
  created_at: new Date(),
} as JobRow;

const pool = {
  query: vi.fn(async (sql: string) => {
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (/from conversations c/.test(sql)) return { rows: [{ channel_session_id: "canal-1", archived_at: null }] };
    return { rows: [] };
  }),
} as never;

function contexto(messages: { direction: "inbound" | "outbound"; body: string; sent_at: string }[]) {
  return { ok: true, context: { contact: { is_blocked: false }, messages } };
}

const ENVIO = { direction: "outbound" as const, body: "Posso te mandar o link?", sent_at: "2026-09-26T10:00:00-03:00" };

const complete = vi.fn(async () => undefined);
let run: (job: JobRow, pool: never, ctx: { workerId: string }) => Promise<void>;

beforeAll(async () => {
  const { createFollowupTurnHandler } = await import("@/lib/agent-engine/agent/followup-turn");
  run = createFollowupTurnHandler({
    knobs: { historyLimit: 20, maxContextTokens: 4000 },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    completeFollowupTurn: complete,
  } as never);
}, 60_000);

beforeEach(() => {
  complete.mockClear();
  runModelCall.mockReset();
  getLeadContext.mockReset();
});

describe("followup_turn purpose=classify", () => {
  it("sem inbound depois do último envio: termina sem chamar o modelo e SEM concluir o passo", async () => {
    getLeadContext.mockResolvedValue(
      contexto([{ direction: "inbound", body: "oi", sent_at: "2026-09-26T09:00:00-03:00" }, ENVIO]),
    );

    await run(job, pool, { workerId: "w1" });

    // Não-vacuidade: o handler chegou ao ramo de classify (leu o contexto).
    expect(getLeadContext).toHaveBeenCalledTimes(1);
    expect(runModelCall).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("controle: com inbound depois do envio, classifica pelo modelo e conclui com a classe", async () => {
    getLeadContext.mockResolvedValue(
      contexto([ENVIO, { direction: "inbound", body: "quero sim", sent_at: "2026-09-26T10:05:00-03:00" }]),
    );
    runModelCall.mockResolvedValue({ result: { text: '{"class": "quer"}' }, model: "m" });

    await run(job, pool, { workerId: "w1" });

    expect(runModelCall).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ nodeId: "c1", result: { kind: "classified", class: "quer" } }),
    );
  });
});
