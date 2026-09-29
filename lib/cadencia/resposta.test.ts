/**
 * O lead respondeu à cadência: a reatividade desvia a inscrição de cadência
 * para a transição atômica e deixa o follow-up comum exatamente como era.
 */
import { describe, expect, it } from "vitest";

import { applyReactivityEvent, type LiveEnrollmentRef, type ReactivityAdminClient } from "@/lib/followup/reactivity";
import type { EnrollmentPatch } from "@/lib/followup/engine";

import {
  reagirNaCadencia,
  type CadenciaRespostaDb,
  type EntregaParaAtendente,
  type RespostaDaCadencia,
  type RespostaRegistrada,
} from "./resposta";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const EVENTO = "33333333-3333-4333-8333-333333333333";
const AGORA = "2026-09-28T12:00:00.000Z";

function fakeCadencia(
  respostas: Record<string, RespostaDaCadencia>,
  registradas: Record<string, RespostaRegistrada> = {},
) {
  const chamadas: Array<{ enrollment: string; evento: string }> = [];
  const entregas: EntregaParaAtendente[] = [];
  const db: CadenciaRespostaDb = {
    async responderCadencia(_org, enrollmentId, eventLogId) {
      chamadas.push({ enrollment: enrollmentId, evento: eventLogId });
      return respostas[enrollmentId] ?? { ja_encerrada: true };
    },
    async respostaRegistrada(_org, enrollmentId) {
      return registradas[enrollmentId] ?? null;
    },
    async entregarParaAtendente(e) {
      entregas.push(e);
    },
  };
  return { db, chamadas, entregas };
}

function montarDb(inscricoes: LiveEnrollmentRef[], cadencia?: CadenciaRespostaDb) {
  const patches: Array<{ id: string; patch: EnrollmentPatch }> = [];
  const eventos: string[] = [];
  const db: ReactivityAdminClient = {
    async loadConversationContactId() {
      return CONTATO;
    },
    async loadContactBlocked() {
      return false;
    },
    async loadLiveEnrollmentsForContact(_o, _c, statuses) {
      const permitidos = statuses ?? ["active", "waiting_reply", "paused_handoff"];
      return inscricoes.filter((e) => permitidos.includes(e.status));
    },
    async insertEnrollmentEvent(event) {
      eventos.push(`${event.enrollment_id}:${event.event_type}`);
      return { inserted: true };
    },
    async updateEnrollment(id, _o, patch) {
      patches.push({ id, patch });
    },
    async agoraNoBanco() {
      return AGORA;
    },
    ...(cadencia !== undefined ? { cadencia } : {}),
  };
  return { db, patches, eventos };
}

function inscricao(over: Partial<LiveEnrollmentRef> = {}): LiveEnrollmentRef {
  return {
    id: "enr-1",
    status: "waiting_reply",
    current_node_id: "n1",
    steps_taken: 2,
    pointer_id: "ptr-1",
    handoff_policy: "pause",
    trigger_config: { kind: "manual", cancel_on_reply: true },
    ...over,
  };
}

const inbound = { id: EVENTO, organization_id: ORG, event_type: "message.received", payload: { contact_id: CONTATO } } as never;
const relogio = () => new Date(AGORA);

describe("reatividade — inscrição de cadência", () => {
  it("chama a transição atômica e NÃO cai no cancel_on_reply", async () => {
    const cad = fakeCadencia({ "enr-1": { ja_encerrada: false, modo: "ia", conversation_id: CONVERSA } });
    const { db, patches, eventos } = montarDb([inscricao({ surface: "cadence" })], cad.db);

    const s = await applyReactivityEvent(db, relogio, inbound);

    expect(cad.chamadas).toEqual([{ enrollment: "enr-1", evento: EVENTO }]);
    expect(patches).toEqual([]);
    expect(eventos).toEqual([]);
    expect(s.reacted).toBe(1);
  });

  it("modo ia não entrega a ninguém; modo atendente entrega uma vez", async () => {
    const ia = fakeCadencia({ "enr-1": { ja_encerrada: false, modo: "ia", conversation_id: CONVERSA } });
    await applyReactivityEvent(montarDb([inscricao({ surface: "cadence" })], ia.db).db, relogio, inbound);
    expect(ia.entregas).toEqual([]);

    const at = fakeCadencia({
      "enr-1": { ja_encerrada: false, modo: "atendente", motivo: "agente_indisponivel", conversation_id: CONVERSA, lead_id: "lead-1", pointer_id: "ptr-1" },
    });
    await applyReactivityEvent(montarDb([inscricao({ surface: "cadence" })], at.db).db, relogio, inbound);
    expect(at.entregas).toEqual([
      { organizationId: ORG, conversationId: CONVERSA, leadId: "lead-1", pointerId: "ptr-1", enrollmentId: "enr-1", motivo: "agente_indisponivel" },
    ]);
  });

  it("gêmeos na mesma conversa: uma entrega só", async () => {
    const at = fakeCadencia({
      "enr-1": { ja_encerrada: false, modo: "atendente", conversation_id: CONVERSA, pointer_id: "ptr-1" },
      "enr-2": { ja_encerrada: false, modo: "atendente", conversation_id: CONVERSA, pointer_id: "ptr-1" },
    });
    const { db } = montarDb(
      [inscricao({ surface: "cadence" }), inscricao({ id: "enr-2", surface: "cadence", status: "active" })],
      at.db,
    );
    await applyReactivityEvent(db, relogio, inbound);
    expect(at.chamadas).toHaveLength(2);
    expect(at.entregas).toHaveLength(1);
  });

  it("ja_encerrada de outro evento: nada acontece", async () => {
    const cad = fakeCadencia(
      {},
      { "enr-1": { modo: "atendente", motivo: null, event_log_id: "outro-evento", conversation_id: CONVERSA, lead_id: null, pointer_id: "ptr-1" } },
    );
    const s = await applyReactivityEvent(montarDb([inscricao({ surface: "cadence" })], cad.db).db, relogio, inbound);
    expect(cad.entregas).toEqual([]);
    expect(s.reacted).toBe(0);
  });

  it("retry do MESMO evento depois de falhar na entrega: refaz a entrega (idempotente por event_log.id)", async () => {
    const cad = fakeCadencia(
      {},
      { "enr-1": { modo: "atendente", motivo: null, event_log_id: EVENTO, conversation_id: CONVERSA, lead_id: null, pointer_id: "ptr-1" } },
    );
    await applyReactivityEvent(montarDb([inscricao({ surface: "cadence" })], cad.db).db, relogio, inbound);
    expect(cad.entregas).toHaveLength(1);

    const ia = fakeCadencia(
      {},
      { "enr-1": { modo: "ia", motivo: null, event_log_id: EVENTO, conversation_id: CONVERSA, lead_id: null, pointer_id: "ptr-1" } },
    );
    await applyReactivityEvent(montarDb([inscricao({ surface: "cadence" })], ia.db).db, relogio, inbound);
    expect(ia.entregas).toEqual([]);
  });

  it("dormente da cadência TAMBÉM passa pela transição", async () => {
    const cad = fakeCadencia({ "enr-1": { ja_encerrada: false, modo: "ia" } });
    await applyReactivityEvent(montarDb([inscricao({ surface: "cadence", status: "dormente" })], cad.db).db, relogio, inbound);
    expect(cad.chamadas).toHaveLength(1);
  });

  it.each(["paused_handoff", "paused_manual"] as const)(
    "cadência %s: só CANCELA (replied), sem transição, sem handoff e sem condução",
    async (status) => {
      const cad = fakeCadencia({});
      const { db, patches, eventos } = montarDb([inscricao({ surface: "cadence", status })], cad.db);
      const s = await applyReactivityEvent(db, relogio, inbound);
      expect(cad.chamadas).toEqual([]);
      expect(cad.entregas).toEqual([]);
      expect(patches).toHaveLength(1);
      expect(patches[0]?.patch).toMatchObject({ status: "cancelled", outcome: "replied", cancel_reason: "lead_respondeu:pausada" });
      expect(eventos).toEqual(["enr-1:cadencia_lead_respondeu"]);
      expect(s.reacted).toBe(1);
    },
  );

  it("follow-up COMUM pausado à mão continua intocado pela resposta (controle)", async () => {
    const cad = fakeCadencia({});
    const { db, patches } = montarDb([inscricao({ surface: "followup", status: "paused_manual" })], cad.db);
    await applyReactivityEvent(db, relogio, inbound);
    expect(patches).toEqual([]);
  });

  it("follow-up comum (surface followup) segue intacto: cancel_on_reply cancela como antes", async () => {
    const cad = fakeCadencia({});
    const { db, patches } = montarDb([inscricao({ surface: "followup" })], cad.db);
    await applyReactivityEvent(db, relogio, inbound);
    expect(cad.chamadas).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.patch).toMatchObject({ status: "cancelled", outcome: "replied", cancel_reason: "cancel_on_reply" });
  });

  it("sem o cliente da cadência (fakes antigos), a inscrição de cadência segue o caminho antigo", async () => {
    const { db, patches } = montarDb([inscricao({ surface: "cadence" })]);
    await applyReactivityEvent(db, relogio, inbound);
    expect(patches[0]?.patch).toMatchObject({ cancel_reason: "cancel_on_reply" });
  });
});

describe("reagirNaCadencia — regra pura", () => {
  it("inscrição sem conversa em modo atendente não entrega (não há onde)", async () => {
    const cad = fakeCadencia({ "enr-1": { ja_encerrada: false, modo: "atendente", conversation_id: null } });
    const r = await reagirNaCadencia(cad.db, { id: EVENTO, organization_id: ORG }, "enr-1", new Set());
    expect(r).toBe(true);
    expect(cad.entregas).toEqual([]);
  });
});
