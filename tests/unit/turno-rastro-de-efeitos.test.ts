/**
 * RASTRO DE EFEITOS DO TURNO — teste de caracterização da ADR-0006 (fatia S0).
 *
 * O turno da IA vai ser fatiado em módulos (ADR-0006), uma PR por fase, só
 * movendo código. Este teste é a régua de "não mudou nada": roda o turno de
 * verdade (`runAgentTurn` → `executarTurnoDoAgente`) com dublês baratos e grava,
 * EM ORDEM, o que ele fez no mundo:
 *
 *   - `db:` escrita no banco (verbo + tabela; leitura não entra) e transação;
 *   - `send:` envio pelo canal (tipo e corpo);
 *   - `llm:` chamada de modelo por propósito (`purpose` do seam);
 *   - `tool:` ferramenta que o modelo chamou e o desfecho dela (`ok`/`code`);
 *   - `job:` reagendamento ou enfileiramento visto no SQL;
 *   - `log:` só os avisos e erros (e os `info` de saída do turno).
 *
 * O rastro de cada cenário é comparado com o snapshot versionado. Fatia de
 * MOVIMENTO não atualiza snapshot: se ele mudou, o comportamento mudou. Só uma
 * PR que muda comportamento de propósito regrava (`vitest -u`), e diz por quê.
 *
 * Dublês, sem Postgres: o pool fingido de `turno-le-em-paralelo.test.ts` (só
 * devolve as linhas mínimas para o turno abrir), o seam de modelo
 * (`runModelCall`) roteirizado por cenário, e o canal por `deps.channel`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SeamDeModelo from "@/lib/agent-engine/edge/llm/run-model-call";
import type * as Handoff from "@/lib/agent-engine/agent/human-handoff";

vi.mock("@/lib/agent-engine/edge/llm/run-model-call", async (importOriginal) => {
  const real = await importOriginal<typeof SeamDeModelo>();
  return { ...real, runModelCall: vi.fn() };
});
vi.mock("@/lib/agent-engine/agent/human-handoff", async (importOriginal) => {
  const real = await importOriginal<typeof Handoff>();
  return { ...real, isLeadInHandoff: vi.fn(async () => false) };
});

import { runAgentTurn } from "@/lib/agent-engine/agent/inbound-turn";
import { isLeadInHandoff } from "@/lib/agent-engine/agent/human-handoff";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";

const ORG = "22222222-2222-4222-8222-222222222222";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "55555555-5555-4555-8555-555555555555";

const LINHA_DO_CONTATO = {
  name: "Cliente", display_name: null, email: null, phone_number: "5511999999999", tags: [],
  is_blocked: false, is_personal: false, source: "whatsapp", consent: null, is_anonymized: false,
};

type Rastro = string[];

const CHECKPOINT = JSON.stringify({ commitments: [], objections: [], next_action: null, rolling_summary: "resumo do turno" });

/** Verbo + tabela de uma escrita; `null` para leitura. CTE conta pela primeira escrita dentro dela. */
export function efeitoDoSql(sql: string): string | null {
  const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (/^(begin|commit|rollback)\b/.test(s)) return `db:${s.split(" ")[0]}`;
  const m = s.match(/\b(insert into|update|delete from)\s+([a-z_."]+)/);
  if (!m) return null;
  // `for update` / `do update set` não são escrita própria: o verbo vem antes.
  if (m[1] === "update" && /\b(for|do) update\b/.test(s) && !/^update\b|\bupdate [a-z_."]+ set\b/.test(s)) return null;
  const [, verbo = "", alvo = ""] = m;
  const tabela = alvo.replace(/"/g, "").replace(/^public\./, "");
  if (tabela === "jobs" && verbo === "update") return `job:update jobs`;
  if (tabela === "jobs" && verbo === "insert into") return `job:insert jobs`;
  return `db:${verbo.split(" ")[0]} ${tabela}`;
}

function poolQueGrava(rastro: Rastro) {
  const query = async (sql: string | { text: string }) => {
    const texto = typeof sql === "string" ? sql : sql.text;
    const efeito = efeitoDoSql(texto);
    if (efeito) rastro.push(efeito);
    await Promise.resolve();
    if (texto.includes("insert into lead_notes")) return { rows: [{ id: "nota-1", superseded: "0" }], rowCount: 1 };
    if (texto.includes("select timezone from organizations")) return { rows: [{ timezone: "America/Sao_Paulo" }], rowCount: 1 };
    if (texto.includes("playbook_pointers")) return { rows: [{ layer: "platform", version_id: "v1", content: "plataforma" }], rowCount: 1 };
    if (/from contacts where organization_id = \$1 and id = \$2/.test(texto)) return { rows: [LINHA_DO_CONTATO], rowCount: 1 };
    if (texto.includes("from conversations") && texto.includes("is_group = false")) return { rows: [{ id: CONVERSA }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, connect: async () => ({ query, release() {} }) };
}

function canalQueGrava(rastro: Rastro) {
  let n = 0;
  return {
    channel: "fake",
    async send(input: { body?: string; kind?: string }) {
      n += 1;
      rastro.push(`send:${input.kind ?? "text"} ${JSON.stringify(input.body ?? "")}`);
      return { kind: "sent" as const, idempotencyKey: `k${n}`, messageId: `m${n}` };
    },
    async sessionHealth() { return { healthy: true, status: "WORKING", since: null }; },
    async signalTyping() {},
    capabilities: () => ({ freeformAnytime: true, serviceWindowHours: null }),
    costPerMessage: () => ({ perMessageUsdCents: 0, model: "flat" as const }),
  };
}

function logQueGrava(rastro: Rastro) {
  const saida = /^turno |turno do agente concluído|não executado|turno pulado/;
  return {
    info: (msg: string) => { if (saida.test(msg)) rastro.push(`log:info ${msg}`); },
    warn: (msg: string) => rastro.push(`log:warn ${msg}`),
    error: (msg: string) => rastro.push(`log:error ${msg}`),
    debug: () => {},
  };
}

type ChamadaDeFerramenta = { nome: string; args: Record<string, unknown> };
type Cenario = {
  ferramentas?: ChamadaDeFerramenta[];
  agente?: Record<string, unknown>;
  modeloFalha?: Error;
  emHandoff?: boolean;
};

const AGENTE = {
  agentId: "agente-1", versionId: "v1", operationMode: "automatic", pausedAt: null,
  systemPrompt: "persona", toolIds: [], casesEnabled: false, handoffToolEnabled: true,
  historyMessageWindow: 20, historyTokenWindow: 1000,
};

/** O seam de modelo roteirizado: classificadores degradam, o turno chama as ferramentas do cenário. */
function roteirizarModelo(rastro: Rastro, c: Cenario) {
  vi.mocked(runModelCall).mockImplementation((async (_db: unknown, _cfg: unknown, input: SeamDeModelo.RunModelCallInput) => {
    const proposito = input.purpose ?? "sem_proposito";
    rastro.push(`llm:${proposito}`);
    if (proposito === "agent_turn") {
      if (c.modeloFalha) throw c.modeloFalha;
      let i = 0;
      for (const f of c.ferramentas ?? []) {
        const t = (input.tools ?? {})[f.nome] as { execute?: (a: unknown, o: unknown) => Promise<unknown> } | undefined;
        if (!t?.execute) { rastro.push(`tool:${f.nome} ausente`); continue; }
        const r = (await t.execute(f.args, { toolCallId: `tc${++i}`, messages: [] })) as
          | { ok?: boolean; code?: string; reason?: string; error?: string | { code?: string } }
          | undefined;
        const motivo = r?.code ?? r?.reason ?? (typeof r?.error === "string" ? r.error : r?.error?.code) ?? "?";
        rastro.push(`tool:${f.nome} ${r?.ok === false ? `recusou ${motivo}` : "ok"}`);
      }
      return { result: { finishReason: "stop", responseMessages: [], text: "", steps: [] }, model: "fake-model", callId: "call-turno" };
    }
    if (proposito === "checkpoint") return { result: { text: CHECKPOINT }, model: "fake-model", callId: "call-ck" };
    throw new Error(`dublê: sem roteiro para ${proposito}`);
  }) as never);
}

export async function rodarCenario(c: Cenario): Promise<Rastro> {
  const rastro: Rastro = [];
  vi.mocked(isLeadInHandoff).mockResolvedValue(c.emHandoff ?? false);
  roteirizarModelo(rastro, c);
  const pool = poolQueGrava(rastro);
  const deps = {
    log: logQueGrava(rastro),
    llmCfg: {},
    crmCfg: {},
    knobs: {
      maxSteps: 4,
      breaker: {
        exactFailureWarn: 2, exactFailureBlock: 3, sameToolFailureWarn: 3,
        sameToolFailureHalt: 5, noProgressWarn: 4, noProgressBlock: 6,
      },
    },
    clock: () => new Date("2026-10-06T15:00:00Z"),
    sleep: async () => {},
    channel: () => canalQueGrava(rastro),
  };
  const job = {
    id: "11111111-1111-4111-8111-111111111111", organization_id: ORG, contact_id: CONTATO,
    kind: "inbound_turn", payload: {}, attempts: 1, claimed_by: "w", claimed_at: new Date(),
  };
  try {
    await runAgentTurn(deps as never, job as never, pool as never, { workerId: "w" }, {
      resolvedAgent: {
        config: { ...AGENTE, ...c.agente },
        routerId: null, intentName: null, confidence: null, outcome: "fallback",
      },
      channelSessionId: "44444444-4444-4444-8444-444444444444",
      conversationId: CONVERSA,
      inboundMessageId: "66666666-6666-4666-8666-666666666666",
      buildOpening: () => "",
    } as never);
    rastro.push("fim:ok");
  } catch (err) {
    rastro.push(`fim:lançou ${(err as Error).message.slice(0, 80)}`);
  }
  return rastro;
}

const CENARIOS: Record<string, Cenario> = {
  "portão: lead em handoff humano": { emHandoff: true },
  "portão: agente pausado": { agente: { pausedAt: "2026-10-01T00:00:00Z" } },
  "portão: agente assistido": { agente: { operationMode: "assisted" } },
  "responde: uma mensagem": {
    ferramentas: [{ nome: "send_message", args: { body: "Oi! Posso te ajudar com o orçamento." } }],
  },
  "responde: duas mensagens diferentes": {
    ferramentas: [
      { nome: "send_message", args: { body: "Oi! Tudo bem?" } },
      { nome: "send_message", args: { body: "O horário de amanhã às 10h está livre." } },
    ],
  },
  "responde: mesmo corpo duas vezes (trava de duplicata)": {
    ferramentas: [
      { nome: "send_message", args: { body: "Oi! Posso te ajudar com o orçamento." } },
      { nome: "send_message", args: { body: "Oi! Posso te ajudar com o orçamento." } },
    ],
  },
  "responde: corpo vazio": { ferramentas: [{ nome: "send_message", args: { body: "   " } }] },
  "responde: acima do teto de envios": {
    ferramentas: [1, 2, 3, 4].map((n) => ({ nome: "send_message", args: { body: `Mensagem número ${n} com conteúdo distinto ${"x".repeat(n * 7)}` } })),
  },
  "turno mudo: modelo não chama ferramenta": { ferramentas: [] },
  "passa para humano: ferramenta de handoff": {
    ferramentas: [{
      nome: "request_human_handoff",
      args: { por_que: "cliente pediu atendente", o_que_tentei: [{ o_que: "expliquei o orçamento", desfecho: "não bastou" }], cliente_quer: "falar com alguém" },
    }],
  },
  // Caracteriza o que existe hoje: o aviso ao lead sai ANTES de o payload ser recusado.
  "passa para humano: payload inválido": {
    ferramentas: [{ nome: "request_human_handoff", args: { reason: "cliente pediu atendente", summary: "quer falar com alguém" } }],
  },
  "ferramenta: nota e estado do lead": {
    ferramentas: [
      { nome: "save_lead_note", args: { headline: "Prefere manhã", body: "Disse que só pode de manhã." } },
      { nome: "send_message", args: { body: "Anotado, vou te oferecer horários de manhã." } },
    ],
  },
  "ferramenta: lê o contexto do lead e responde": {
    ferramentas: [
      { nome: "get_lead_context", args: {} },
      { nome: "send_message", args: { body: "Vi aqui seu histórico, já te respondo." } },
    ],
  },
  "erro do modelo: provedor fora": { modeloFalha: new Error("upstream 503") },
};

beforeEach(() => {
  vi.mocked(runModelCall).mockReset();
});

describe("rastro de efeitos do turno (ADR-0006, S0)", () => {
  for (const [nome, cenario] of Object.entries(CENARIOS)) {
    it(nome, async () => {
      const rastro = await rodarCenario(cenario);
      // Rastro vazio passaria em qualquer refatoração que matasse o turno cedo.
      expect(rastro.length).toBeGreaterThan(0);
      expect(rastro).toMatchSnapshot();
    });
  }

  it("é determinístico: o mesmo cenário duas vezes dá o mesmo rastro", async () => {
    const c = CENARIOS["ferramenta: nota e estado do lead"]!;
    expect(await rodarCenario(c)).toEqual(await rodarCenario(c));
  });
});

describe("controle negativo: o comparador reprova ordem trocada", () => {
  it("trocar dois efeitos vizinhos e distintos faz o rastro deixar de casar", async () => {
    const rastro = await rodarCenario(CENARIOS["ferramenta: nota e estado do lead"]!);
    const i = rastro.findIndex((e, k) => k + 1 < rastro.length && e !== rastro[k + 1]);
    expect(i).toBeGreaterThanOrEqual(0);
    const trocado = [...rastro];
    [trocado[i], trocado[i + 1]] = [trocado[i + 1]!, trocado[i]!];
    // Mesmo conjunto, mesma contagem: só a ordem mudou.
    expect([...trocado].sort()).toEqual([...rastro].sort());
    // O comparador do snapshot (igualdade de array) reprova.
    expect(() => expect(trocado).toEqual(rastro)).toThrow();
  });
});
