/**
 * PASSO DE CRM DA CADÊNCIA (mover etapa, etiqueta) NO MOTOR DE FOLLOW-UP.
 *
 * O defeito que este arquivo impede: o nó `action` enfileirava um turno de
 * ENVIO para qualquer modo. Um passo "mover para Respondeu" viraria uma
 * mensagem vazia (ou um turno do agente) para o cliente. O tipo novo
 * `crm_effect` diz ao motor: aplica e segue, sem turno.
 *
 * O que se prende aqui:
 *   1. o efeito é aplicado e o enrollment segue pela aresta `always`;
 *   2. NENHUM job de envio é enfileirado;
 *   3. o efeito vem ANTES do evento de auditoria (queda no meio não perde o
 *      efeito — ele é idempotente, o replay reaplica);
 *   4. sem adaptador, o passo FALHA (backoff), nunca pula calado.
 */
import { describe, expect, it } from "vitest";

import { runFollowupTick, type AdminClient, type FollowupJobRequest } from "@/lib/followup/engine";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import type { EfeitoDeCrm, EnrollmentEventRef, EnrollmentRow } from "@/lib/followup/node-handlers";

const AGORA = new Date("2026-09-24T15:00:00.000Z");
const ETAPA = "22222222-2222-4222-8222-222222222222";

const grafo: FlowGraph = {
  nodes: [
    { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    {
      id: "mover",
      type: "action",
      label: "Mover",
      position: { x: 0, y: 1 },
      config: { mode: "move_stage", stage_id: ETAPA },
    },
    {
      id: "etiqueta",
      type: "action",
      label: "Etiqueta",
      position: { x: 0, y: 2 },
      config: { mode: "tag", op: "add", tag: "prospectado" },
    },
    { id: "fim", type: "end", label: "Fim", position: { x: 0, y: 3 }, config: { outcome: "exhausted" } },
  ],
  edges: [
    { id: "e1", source: "t", target: "mover", priority: 0, condition: { type: "always" } },
    { id: "e2", source: "mover", target: "etiqueta", priority: 0, condition: { type: "always" } },
    { id: "e3", source: "etiqueta", target: "fim", priority: 0, condition: { type: "always" } },
  ],
};

function montar(opts: { comAdaptador: boolean }) {
  const enrollment: EnrollmentRow = {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "ct-1",
    current_node_id: "mover",
    status: "active",
    next_eval_at: AGORA.toISOString(),
    attempts: 0,
    max_attempts: 5,
    steps_taken: 1,
  } as EnrollmentRow;
  const ordem: string[] = [];
  const efeitos: EfeitoDeCrm[] = [];
  const jobs: FollowupJobRequest[] = [];
  const events: EnrollmentEventRef[] = [];

  const db: AdminClient = {
    async claimDueEnrollments() {
      const vencido = enrollment.next_eval_at !== null && Date.parse(enrollment.next_eval_at!) <= AGORA.getTime();
      return vencido && enrollment.status === "active" ? [{ ...enrollment }] : [];
    },
    async loadFlowGraph() {
      return grafo;
    },
    async loadLeadFacts() {
      return { lead_stage: null, tags: [] };
    },
    async loadEnrollmentEvents() {
      return [...events];
    },
    async loadLastInboundBody() {
      return null;
    },
    async insertEnrollmentEvent(evento) {
      ordem.push(`evento:${evento.event_type}`);
      if (events.some((e) => e.idempotency_key === evento.idempotency_key)) return { inserted: false };
      events.push({ node_id: evento.node_id, idempotency_key: evento.idempotency_key, event_type: evento.event_type, payload: evento.payload });
      return { inserted: true };
    },
    async updateEnrollment(_id, _org, patch) {
      Object.assign(enrollment, patch);
    },
    async loadFlowPointerName() {
      return "Cadência de teste";
    },
    async insertDeadInboxItem() {},
    async persistirRespostaFollowup() {},
    ...(opts.comAdaptador
      ? {
          async aplicarEfeitoDeCrm(_e: EnrollmentRow, efeito: EfeitoDeCrm) {
            ordem.push(`efeito:${efeito.tipo}`);
            efeitos.push(efeito);
          },
        }
      : {}),
  };

  return {
    enrollment,
    ordem,
    efeitos,
    jobs,
    events,
    tick: () =>
      runFollowupTick({
        db,
        clock: () => AGORA,
        enqueueJob: async (j) => {
          jobs.push(j);
        },
      }),
  };
}

describe("passo de CRM da cadência", () => {
  it("aplica o efeito, segue pela aresta e NÃO enfileira envio", async () => {
    const m = montar({ comAdaptador: true });
    await m.tick();
    expect(m.efeitos).toEqual([{ tipo: "move_stage", stage_id: ETAPA }]);
    expect(m.enrollment.current_node_id).toBe("etiqueta");
    expect(m.jobs).toEqual([]);

    await m.tick();
    expect(m.efeitos.at(-1)).toEqual({ tipo: "tag", op: "add", tag: "prospectado" });
    expect(m.enrollment.current_node_id).toBe("fim");
    expect(m.jobs).toEqual([]);
  });

  it("o efeito vem ANTES do evento de auditoria", async () => {
    const m = montar({ comAdaptador: true });
    await m.tick();
    expect(m.ordem).toEqual(["efeito:move_stage", "evento:crm_effect_applied"]);
    // O payload do evento leva só ids e rótulos — nada do cliente.
    expect(m.events[0]?.payload).toEqual({ next_node_id: "etiqueta", tipo: "move_stage", stage_id: ETAPA });
  });

  it("sem adaptador o passo FALHA e fica para nova tentativa — nunca pula calado", async () => {
    const m = montar({ comAdaptador: false });
    const resumo = await m.tick();
    expect(resumo.failed).toBe(1);
    expect(m.enrollment.current_node_id).toBe("mover");
    expect(m.enrollment.last_error).toBe("crm_effect_sem_adaptador");
    expect(m.events).toEqual([]);
  });
});
