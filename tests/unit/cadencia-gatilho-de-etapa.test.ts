/**
 * GATILHO DE ETAPA PARA CADÊNCIA — o negócio entra na etapa e a régua nasce.
 *
 * O que muda em relação ao follow-up comum, e que este arquivo prende:
 *   1. pointer `surface='cadence'` NÃO passa pelo gate do agente de IA — a
 *      Lior não tem agente, e a régua tem de andar sem ele;
 *   2. ele segue pela porta da cadência (que abre a conversa NO NÚMERO da
 *      cadência), nunca pelo `insereEnrollment` ancorado no evento — lead frio
 *      não tem conversa, e ali cairia em `stale_origin` para sempre;
 *   3. sem a porta ligada, o pointer de cadência conta como barrado (nunca
 *      inscreve "pelo caminho de follow-up" por engano);
 *   4. a data de EMISSÃO do evento chega à porta (é ela que barra o estoque
 *      anterior à publicação).
 */
import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import type { FollowupGateDb } from "@/lib/followup/agent-followup-gate";
import { aplicaGatilhoDeEtapa, type GatilhoEtapaDb, type PointerDeEtapa } from "@/lib/followup/gatilho-etapa";

const ETAPA = "33333333-3333-4333-8333-333333333333";

function evento(extra: Partial<EventRow> = {}): EventRow {
  return {
    id: "ev-1",
    organization_id: "org-1",
    event_type: "lead.stage_changed",
    entity_kind: "crm_lead",
    entity_id: "lead-1",
    payload: { to_stage_id: ETAPA, from_stage_id: null },
    metadata: {},
    consumed_by: [],
    attempts: 0,
    created_at: "2026-09-24T12:00:00.000Z",
    ...extra,
  };
}

function montar(pointers: PointerDeEtapa[]) {
  const insercoesDeFollowup: unknown[] = [];
  const db: GatilhoEtapaDb = {
    async carregaPointersDeEtapa() {
      return pointers;
    },
    async carregaContatoDoNegocio() {
      return "ct-1";
    },
    async carregaNoDeGatilho() {
      return "t";
    },
    async insereEnrollment(input) {
      insercoesDeFollowup.push(input);
      return { inserted: true, id: "enr-fu" };
    },
    async insereEventoDoEnrollment() {},
  };
  const gateConsultado: string[] = [];
  const gateDb: FollowupGateDb = {
    async loadEnabledPublishedFollowupAgents(orgId) {
      gateConsultado.push(orgId);
      return [];
    },
  };
  return { db, gateDb, insercoesDeFollowup, gateConsultado };
}

const cadencia: PointerDeEtapa = {
  id: "ptr-cad",
  organization_id: "org-1",
  active_version_id: "ver-1",
  stage_id: ETAPA,
  surface: "cadence",
};

describe("gatilho de etapa → cadência", () => {
  it("inscreve pela porta da cadência, sem gate de agente e sem o caminho de follow-up", async () => {
    const m = montar([cadencia]);
    const chamadas: unknown[] = [];
    const resumo = await aplicaGatilhoDeEtapa(
      {
        db: m.db,
        gateDb: m.gateDb,
        clock: () => new Date("2026-09-24T12:00:05.000Z"),
        inscreverNaCadencia: async (input) => {
          chamadas.push(input);
          return { ok: true, enrollmentId: "enr-cad" };
        },
      },
      evento(),
    );
    expect(chamadas).toEqual([
      {
        organizationId: "org-1",
        pointerId: "ptr-cad",
        leadId: "lead-1",
        eventId: "ev-1",
        eventoEm: "2026-09-24T12:00:00.000Z",
      },
    ]);
    expect(resumo.enrolled).toBe(1);
    expect(resumo.cadencia_inscritos).toBe(1);
    expect(m.insercoesDeFollowup).toEqual([]);
    expect(m.gateConsultado).toEqual([]);
  });

  it("recusa da porta é contada com o motivo, nunca vira erro", async () => {
    const m = montar([cadencia]);
    const resumo = await aplicaGatilhoDeEtapa(
      {
        db: m.db,
        gateDb: m.gateDb,
        clock: () => new Date(),
        inscreverNaCadencia: async () => ({ ok: false, motivo: "anterior_a_publicacao" }),
      },
      evento(),
    );
    expect(resumo.enrolled).toBe(0);
    expect(resumo.cadencia_recusas).toEqual(["anterior_a_publicacao"]);
  });

  it("sem a porta ligada, cadência conta como barrada — nunca cai no caminho de follow-up", async () => {
    const m = montar([cadencia]);
    const resumo = await aplicaGatilhoDeEtapa({ db: m.db, gateDb: m.gateDb, clock: () => new Date() }, evento());
    expect(resumo.pointers_barrados_pelo_gate).toBe(1);
    expect(m.insercoesDeFollowup).toEqual([]);
  });

  it("evento sem data de emissão falha ABERTO (usa o relógio), como pede o EventRow", async () => {
    const m = montar([cadencia]);
    let eventoEm = "";
    await aplicaGatilhoDeEtapa(
      {
        db: m.db,
        gateDb: m.gateDb,
        clock: () => new Date("2026-09-24T15:00:00.000Z"),
        inscreverNaCadencia: async (input) => {
          eventoEm = input.eventoEm;
          return { ok: true, enrollmentId: "x" };
        },
      },
      evento({ created_at: undefined }),
    );
    expect(eventoEm).toBe("2026-09-24T15:00:00.000Z");
  });

  it("controle: pointer de follow-up comum continua exigindo o agente", async () => {
    const { surface: _s, ...followup } = cadencia;
    const m = montar([{ ...followup, id: "ptr-fu" }]);
    const resumo = await aplicaGatilhoDeEtapa(
      {
        db: m.db,
        gateDb: m.gateDb,
        clock: () => new Date(),
        inscreverNaCadencia: async () => ({ ok: true, enrollmentId: "nao-deveria" }),
      },
      evento(),
    );
    expect(m.gateConsultado).toEqual(["org-1"]);
    expect(resumo.pointers_barrados_pelo_gate).toBe(1);
    expect(resumo.enrolled).toBe(0);
  });
});
