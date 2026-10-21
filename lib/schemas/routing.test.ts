import { describe, expect, it } from "vitest";

import { availabilityPatchSchema, CAPACIDADE_MAXIMA } from "./routing";

/**
 * A capacidade por atendente travava em 1.000 só na validação (o banco exige
 * > 0). A Delicatto precisou de 5.000 e foi direto no banco; o teto do produto
 * agora é 10.000.
 */
describe("capacidade do atendente (PATCH de disponibilidade)", () => {
  it("⭐ 5.000 é aceito (era recusado com o teto de 1.000)", () => {
    expect(availabilityPatchSchema.safeParse({ capacity: 5000 }).success).toBe(true);
  });

  it("o teto é 10.000: aceito, e 10.001 recusado", () => {
    expect(CAPACIDADE_MAXIMA).toBe(10_000);
    expect(availabilityPatchSchema.safeParse({ capacity: 10_000 }).success).toBe(true);
    expect(availabilityPatchSchema.safeParse({ capacity: 10_001 }).success).toBe(false);
  });

  it("controle: zero e fração continuam recusados", () => {
    expect(availabilityPatchSchema.safeParse({ capacity: 0 }).success).toBe(false);
    expect(availabilityPatchSchema.safeParse({ capacity: 2.5 }).success).toBe(false);
  });
});
