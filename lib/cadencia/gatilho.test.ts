import { describe, expect, it } from "vitest";

import { validarGatilhoDaCadencia } from "./gatilho";

const FUNIL = "11111111-1111-4111-8111-111111111111";
const ETAPA = "33333333-3333-4333-8333-333333333333";

function admin(etapa: Record<string, unknown> | null) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: etapa, error: null }) };
  return { from: () => q } as never;
}

const etapaOk = { id: ETAPA, pipeline_id: FUNIL, is_archived: false, is_lost: false };

describe("gatilho da cadência — só o que a porta dela implementa", () => {
  it("manual e etapa do funil passam", async () => {
    expect(await validarGatilhoDaCadencia(admin(null), "org", FUNIL, { kind: "manual" })).toBeNull();
    expect(
      await validarGatilhoDaCadencia(admin(etapaOk), "org", FUNIL, { kind: "stage_change", params: { stage_id: ETAPA } }),
    ).toBeNull();
  });

  it("silêncio e caso aberto são recusados (a cadência nunca inscreveria por eles)", async () => {
    for (const kind of ["silence", "case_opened", "conversation_end", "webhook"]) {
      expect(await validarGatilhoDaCadencia(admin(null), "org", FUNIL, { kind })).not.toBeNull();
    }
  });

  it("etapa de outro funil, arquivada ou de perda é recusada", async () => {
    const gatilho = { kind: "stage_change", params: { stage_id: ETAPA } };
    expect(await validarGatilhoDaCadencia(admin({ ...etapaOk, pipeline_id: "outro" }), "org", FUNIL, gatilho)).not.toBeNull();
    expect(await validarGatilhoDaCadencia(admin({ ...etapaOk, is_archived: true }), "org", FUNIL, gatilho)).not.toBeNull();
    expect(await validarGatilhoDaCadencia(admin({ ...etapaOk, is_lost: true }), "org", FUNIL, gatilho)).not.toBeNull();
    expect(await validarGatilhoDaCadencia(admin(null), "org", FUNIL, gatilho)).not.toBeNull();
  });

  it("etiqueta: exige o texto e o funil", async () => {
    expect(await validarGatilhoDaCadencia(admin(null), "org", FUNIL, { kind: "tag_added", params: { tag: "Lista fria" } })).toBeNull();
    expect(await validarGatilhoDaCadencia(admin(null), "org", FUNIL, { kind: "tag_added", params: { tag: "  " } })).not.toBeNull();
    expect(await validarGatilhoDaCadencia(admin(null), "org", null, { kind: "tag_added", params: { tag: "x" } })).not.toBeNull();
  });

  it("tempo: atendente de 5 min a 7 dias; lead parado de 1 hora a 30 dias", async () => {
    const v = (kind: string, threshold_minutes: number) =>
      validarGatilhoDaCadencia(admin(null), "org", FUNIL, { kind, params: { threshold_minutes } });
    expect(await v("agent_sla", 5)).toBeNull();
    expect(await v("agent_sla", 4)).not.toBeNull();
    expect(await v("agent_sla", 10_081)).not.toBeNull();
    expect(await v("lead_idle", 60)).toBeNull();
    expect(await v("lead_idle", 59)).not.toBeNull();
    expect(await v("lead_idle", 43_201)).not.toBeNull();
    expect(await v("lead_idle", 90.5)).not.toBeNull();
  });
});
