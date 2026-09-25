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
});
