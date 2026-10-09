import { describe, expect, it } from "vitest";

import { decideMotivoDaPerda, motivoDaPerdaObrigatorio } from "./motivo-da-perda";

const PERDA = { id: "perda", name: "Não comprou", is_lost: true };

describe("motivo de perda opcional por funil", () => {
  it("preserva a exigência quando a configuração está ausente", () => {
    expect(motivoDaPerdaObrigatorio(null)).toBe(true);
    expect(decideMotivoDaPerda({ etapaDeDestino: PERDA }).ok).toBe(false);
  });

  it("libera a etapa de perda somente com false explícito", () => {
    expect(motivoDaPerdaObrigatorio({ lost_reason_required: false })).toBe(false);
    expect(
      decideMotivoDaPerda({
        etapaDeDestino: PERDA,
        settingsDoFunil: { lost_reason_required: false },
      }),
    ).toEqual({ ok: true, patch: {} });
  });

  it("continua gravando o motivo quando ele é informado num funil opcional", () => {
    expect(
      decideMotivoDaPerda({
        etapaDeDestino: PERDA,
        motivo: "Preço",
        settingsDoFunil: { lost_reason_required: false },
      }),
    ).toEqual({ ok: true, patch: { lost_reason: "Preço" } });
  });
});
