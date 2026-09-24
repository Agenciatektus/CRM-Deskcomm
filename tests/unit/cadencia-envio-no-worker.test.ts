/**
 * O ENVIO DE UM PASSO DE CADÊNCIA NO WORKER (`followup-turn`).
 *
 * A política da cadência é relida do banco NA HORA do envio, e decide se o passo
 * sai agora, depois (reagenda + avisa o enrollment) ou nunca (fecha o passo). O
 * que este arquivo prende, com a cadeia de guardrails dublada:
 *
 *   1. com tudo em ordem, a cadeia recebe a COTA do número (antes `null`), o
 *      ESPAÇAMENTO da cadência, o gate LGPD de PROSPECÇÃO armado e o RODAPÉ de
 *      saída na 1ª mensagem;
 *   2. cota do dia / espaçamento vetados REAGENDAM (o texto fixo comum descarta
 *      — na cadência isso apagaria o passo de quem só chegou tarde);
 *   3. fora da janela da cadência, kill switch da org → adiado, sem tocar na cadeia;
 *   4. contato que saiu / número divergente / cadência desligada → passo fechado.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobRow } from "@/lib/agent-engine/queue/queue";

const ORG = "org-1";
const LEAD = "lead-1";
const CONVERSA = "conversa-1";
const CANAL = "canal-lior";
const POINTER = "44444444-4444-4444-8444-444444444444";

/** Quarta 24/09/2026, 12:00 em São Paulo — dentro da janela seg–sex 08–18. */
const QUARTA_MEIO_DIA = new Date("2026-09-24T15:00:00.000Z");
/** Sábado — fora da janela seg–sex. */
const SABADO = new Date("2026-09-26T15:00:00.000Z");

const ENVIADO = { status: "sent", outcome: { kind: "sent" }, trace: [] };
const chain = vi.fn(async (_args: Record<string, unknown>) => ENVIADO as unknown as Record<string, unknown>);
vi.mock("@/lib/agent-engine/guardrails/before-send", () => ({
  runBeforeSend: (args: Record<string, unknown>) => chain(args),
}));
vi.mock("@/lib/agent-engine/agent/human-handoff", () => ({ isLeadInHandoff: vi.fn(async () => false) }));
vi.mock("@/lib/agent-engine/agent/fuso-da-org", () => ({ fusoDaOrganizacao: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("@/lib/agent-engine/edge/crm/get-lead-context", () => ({
  getLeadContext: vi.fn(async () => ({
    ok: true,
    context: { contact: { is_blocked: false } },
    lgpd: { isAnonymized: false, isProspecting: false, legalBasis: {} },
  })),
}));
const scheduleCronJob = vi.fn(async () => undefined);
vi.mock("@/lib/agent-engine/cron/scheduler", () => ({ scheduleCronJob }));

const boundary = {
  organization_id: ORG,
  contact_id: LEAD,
  conversation_id: CONVERSA,
  service_revision: 1,
  demanda_id: null,
  demanda_revision: null,
};

const settings = {
  janela: { start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] },
  espacamento: { min_s: 45, max_s: 120 },
  legal_basis_ref: "LIA-2026 prospecção lojistas",
  max_inscricoes_dia: 100,
};

interface Cenario {
  cadencia: Record<string, unknown> | null;
  canalDaConversa: string;
  contato: Record<string, unknown> | null;
  telefoneSuprimido: boolean;
  jaTeveEnvio: boolean;
}

function cenarioPadrao(): Cenario {
  return {
    cadencia: {
      id: POINTER,
      status: "active",
      channel_session_id: CANAL,
      cadence_settings: settings,
      daily_message_limit: 150,
      pausada: false,
    },
    canalDaConversa: CANAL,
    contato: {
      is_blocked: false,
      force_human: false,
      is_anonymized: false,
      source: "import",
      consent: { legitimate_interest: { ref: "LIA-2026" } },
      phone_number: "+5522999990000",
    },
    telefoneSuprimido: false,
    jaTeveEnvio: false,
  };
}

let cenario = cenarioPadrao();

function fakePool() {
  const query = vi.fn(async (sql: string): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }> => {
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (sql.includes("from followup_flow_pointers p")) return { rows: cenario.cadencia ? [cenario.cadencia] : [] };
    if (sql.includes("select exists(")) return { rows: [{ existe: cenario.telefoneSuprimido }] };
    if (sql.includes("from contacts where organization_id")) return { rows: cenario.contato ? [cenario.contato] : [] };
    if (sql.includes("select last_outbound_at from conversations")) {
      return { rows: [{ last_outbound_at: cenario.jaTeveEnvio ? "2026-09-23T10:00:00Z" : null }] };
    }
    if (/from conversations c/.test(sql)) {
      return { rows: [{ id: CONVERSA, channel_session_id: cenario.canalDaConversa, archived_at: null }] };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query } as never;
}

function job(): JobRow {
  return {
    id: "job-1",
    organization_id: ORG,
    contact_id: LEAD,
    kind: "followup_turn",
    source_event_id: null,
    payload: {
      followup_enrollment_id: "11111111-1111-4111-8111-111111111111",
      node_id: "a1",
      purpose: "send_message",
      fixed_body: "Oi Maria, tudo bem?",
      cadencia: { pointer_id: POINTER },
      service_boundary: boundary,
    },
    status: "running",
    priority: 0,
    run_after: QUARTA_MEIO_DIA,
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    locked_by: "w1",
    locked_at: QUARTA_MEIO_DIA,
    created_at: QUARTA_MEIO_DIA,
  } as JobRow;
}

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;
beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

beforeEach(() => {
  cenario = cenarioPadrao();
  chain.mockReset();
  chain.mockImplementation(async () => ENVIADO as unknown as Record<string, unknown>);
  scheduleCronJob.mockClear();
});

async function rodar(agora: Date = QUARTA_MEIO_DIA) {
  const completeFollowupTurn = vi.fn(async () => undefined);
  const deps = {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    crmCfg: {},
    llmCfg: {},
    knobs: {},
    clock: () => agora,
    channel: () => ({ send: vi.fn(async () => ({ ok: true })) }),
    completeFollowupTurn,
  } as never;
  await criarHandler(deps)(job(), fakePool(), { workerId: "w1" });
  const resultado = (completeFollowupTurn.mock.calls[0] as unknown[] | undefined)?.[1] as
    | { result: { kind: string; until?: Date; reason?: string } }
    | undefined;
  return { resultado: resultado?.result, completeFollowupTurn };
}

describe("envio da cadência — o que chega à cadeia de guardrails", () => {
  it("cota do número, espaçamento, LGPD de prospecção e rodapé na 1ª mensagem", async () => {
    const { resultado } = await rodar();
    expect(resultado?.kind).toBe("sent");
    expect(chain).toHaveBeenCalledTimes(1);
    const args = chain.mock.calls[0]![0] as {
      crmDailyLimit: number | null;
      espacamentoAutomatico?: { minMs: number; maxMs: number };
      lgpd: { isProspecting: boolean };
      body: string;
    };
    expect(args.crmDailyLimit).toBe(150);
    expect(args.espacamentoAutomatico).toEqual({ minMs: 45_000, maxMs: 120_000 });
    expect(args.lgpd.isProspecting).toBe(true);
    expect(args.body.startsWith("Oi Maria, tudo bem?")).toBe(true);
    expect(args.body.length).toBeGreaterThan("Oi Maria, tudo bem?".length); // rodapé de saída
  });

  it("2ª mensagem da conversa sai SEM rodapé", async () => {
    cenario.jaTeveEnvio = true;
    await rodar();
    const args = chain.mock.calls[0]![0] as { body: string };
    expect(args.body).toBe("Oi Maria, tudo bem?");
  });
});

describe("cota e espaçamento reagendam — nunca descartam o passo", () => {
  for (const code of ["daily_cap", "warmup_cap", "cadence_spacing"]) {
    it(`veto ${code} → adiado para o nextAllowedAt`, async () => {
      const depois = new Date(QUARTA_MEIO_DIA.getTime() + 90_000);
      chain.mockImplementation(async () =>
        ({ status: "vetoed", code, nextAllowedAt: depois, trace: [] }) as unknown as Record<string, unknown>,
      );
      const { resultado } = await rodar();
      expect(resultado?.kind).toBe("deferred");
      expect(resultado?.until?.toISOString()).toBe(depois.toISOString());
      expect(scheduleCronJob).toHaveBeenCalledTimes(1);
    });
  }
});

describe("política da cadência antes da cadeia", () => {
  it("fora da janela (sábado) → adiado, sem chamar a cadeia", async () => {
    const { resultado } = await rodar(SABADO);
    expect(resultado?.kind).toBe("deferred");
    expect(chain).not.toHaveBeenCalled();
  });

  it("kill switch da organização → adiado", async () => {
    cenario.cadencia = { ...cenario.cadencia!, pausada: true };
    const { resultado } = await rodar();
    expect(resultado?.kind).toBe("deferred");
    expect(chain).not.toHaveBeenCalled();
  });

  it("cadência desligada → passo fechado", async () => {
    cenario.cadencia = { ...cenario.cadencia!, status: "disabled" };
    const { resultado } = await rodar();
    expect(resultado?.kind).toBe("skipped");
    expect(chain).not.toHaveBeenCalled();
  });

  it("conversa em OUTRO número → passo fechado (nunca pelo chip errado)", async () => {
    cenario.canalDaConversa = "outro-numero";
    const { resultado } = await rodar();
    expect(resultado?.kind).toBe("skipped");
    expect(chain).not.toHaveBeenCalled();
  });

  it("contato que pediu para sair → passo fechado", async () => {
    cenario.contato = { ...cenario.contato!, consent: { marketing: { declined_at: "2026-09-20" } } };
    const { resultado } = await rodar();
    expect(resultado?.kind).toBe("skipped");
    expect(chain).not.toHaveBeenCalled();
  });

  it("outro cadastro do MESMO telefone saiu → passo fechado", async () => {
    cenario.telefoneSuprimido = true;
    const { resultado } = await rodar();
    expect(resultado?.kind).toBe("skipped");
    expect(chain).not.toHaveBeenCalled();
  });
});
