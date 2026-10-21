import { describe, expect, it, vi } from "vitest";

import { runBeforeSend } from "@/lib/agent-engine/guardrails/before-send";

/**
 * O PAR OBRIGATÓRIO DA LIBERAÇÃO (9060).
 *
 * `lib/ai/elegibilidade/gate.ts` deixa o auxiliar de CRM atuar em conversa já
 * assumida por uma pessoa. Essa liberação só é defensável enquanto ESTE veto
 * existir: sem ele, a mesma marca que abre a porta viraria a IA falando por
 * cima de quem assumiu o atendimento.
 *
 * A trava mora aqui, e não no prompt, por um motivo medido: a resposta do
 * modelo não passa por ferramenta nenhuma — ele devolve texto e o motor envia.
 * "Não falar" não é verificável pela lista de capacidades, então é verificado
 * no único lugar por onde todo envio passa.
 */
describe("auxiliar de CRM não envia", () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  // O pool explode se for tocado: o veto é a PRIMEIRA coisa da cadeia e não
  // pode depender de banco. Se um dia alguém mover o veto para depois do lock,
  // este teste falha com "o veto tocou o banco" em vez de passar por engano.
  const pool = {
    connect: () => {
      throw new Error("o veto tocou o banco");
    },
    query: () => {
      throw new Error("o veto tocou o banco");
    },
  } as never;

  const args = {
    pool,
    log: log as never,
    tenantId: "11111111-1111-1111-1111-111111111111",
    leadId: "22222222-2222-2222-2222-222222222222",
    channelSessionId: "33333333-3333-3333-3333-333333333333",
    body: "oi, tudo bem? posso ajudar?",
    optedOutThisTurn: false,
    crmDailyLimit: null,
    now: new Date("2026-10-20T20:00:00Z"),
  };

  it("⭐ com a marca: o envio é vetado, sem tocar no banco", async () => {
    const r = await runBeforeSend({ ...args, agenteSomenteInterno: true } as never);
    expect(r.status).toBe("vetoed");
    if (r.status !== "vetoed") return;
    expect(r.code).toBe("agente_somente_interno");
    expect(r.gate).toBe("auxiliar_de_crm");
    // A mensagem volta ao modelo: ela diz o que fazer, não só o que não fazer.
    expect(r.message).toContain("registre no card");
    expect(r.trace).toEqual([
      { gate: "auxiliar_de_crm", verdict: "veto", code: "agente_somente_interno" },
    ]);
  });

  it("CONTROLE — sem a marca, a cadeia SEGUE (e aqui ela esbarra no pool de mentira)", async () => {
    // Sem este caso, um `return vetoed` incondicional passaria no teste acima e
    // mataria todo envio do produto. O erro do pool é a prova de que a execução
    // passou do veto e foi adiante.
    await expect(runBeforeSend(args as never)).rejects.toThrow("o veto tocou o banco");
  });

  it("CONTROLE — `false` e ausente são a mesma coisa: não vetam", async () => {
    await expect(
      runBeforeSend({ ...args, agenteSomenteInterno: false } as never),
    ).rejects.toThrow("o veto tocou o banco");
  });
});
