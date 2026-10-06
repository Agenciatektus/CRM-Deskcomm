import { describe, expect, it } from "vitest";

import { snoozeSchema } from "@/lib/schemas/snooze";

describe("snoozeSchema", () => {
  it("aceita duration_hours 1, 3 e 24", () => {
    expect(snoozeSchema.safeParse({ duration_hours: 1 }).success).toBe(true);
    expect(snoozeSchema.safeParse({ duration_hours: 3 }).success).toBe(true);
    expect(snoozeSchema.safeParse({ duration_hours: 24 }).success).toBe(true);
  });
  it("rejeita valores fora do enum fechado", () => {
    expect(snoozeSchema.safeParse({ duration_hours: 0 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ duration_hours: 5 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ duration_hours: -1 }).success).toBe(false);
  });
  it("rejeita string em vez de number", () => {
    expect(snoozeSchema.safeParse({ duration_hours: "1" }).success).toBe(false);
  });
  // A tela do visual v2 manda o INSTANTE ("Amanhã 9:00" não é um número fixo de
  // horas). O contrato antigo continua de pé ao lado dele.
  it("aceita snooze_until em ISO com fuso, e recusa texto que não é data", () => {
    expect(snoozeSchema.safeParse({ snooze_until: "2026-10-07T12:00:00.000Z" }).success).toBe(true);
    expect(snoozeSchema.safeParse({ snooze_until: "2026-10-07T09:00:00-03:00" }).success).toBe(true);
    expect(snoozeSchema.safeParse({ snooze_until: "amanhã" }).success).toBe(false);
    expect(snoozeSchema.safeParse({}).success).toBe(false);
  });
  it("snooze_until sem fuso é recusado: a mesma string viraria instantes diferentes", () => {
    expect(snoozeSchema.safeParse({ snooze_until: "2026-10-07T09:00:00" }).success).toBe(false);
  });
  it("as duas formas juntas são recusadas, nenhuma vence em silêncio", () => {
    expect(
      snoozeSchema.safeParse({ duration_hours: 1, snooze_until: "2026-10-07T12:00:00.000Z" }).success,
    ).toBe(false);
  });
});
