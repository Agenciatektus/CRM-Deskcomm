/**
 * #3102 — campanha parada pelo próprio ritmo não ocupa o número.
 *
 * Duas campanhas no mesmo número: a mais antiga bateu o teto diário dela e a
 * seguinte não mandava nada pelo resto do dia (e pelos dias seguintes), porque
 * a rodada ocupava o número com qualquer resultado que não fosse "concluiu".
 */
import { describe, expect, it } from "vitest";

import { ocupaONumero } from "@/lib/campanhas/rodada";

const r = (detalhe: string, concluidas = 0) => ({ concluidas, detalhe });

describe("ocupaONumero", () => {
  it.each(["ritmo:teto_diario", "ritmo:teto_horario", "ritmo:intervalo", "ritmo:fora_da_janela"])(
    "veto do ritmo da própria campanha (%s) deixa o número livre para a seguinte",
    (detalhe) => {
      expect(ocupaONumero(r(detalhe))).toBe(false);
    },
  );

  it("campanha só esperando next_attempt_at deixa o número livre", () => {
    expect(ocupaONumero(r("aguardando"))).toBe(false);
  });

  it("campanha que concluiu deixa o número livre", () => {
    expect(ocupaONumero(r("concluida", 1))).toBe(false);
    expect(ocupaONumero(r("ja_concluida"))).toBe(false);
  });

  it.each([
    "enviado:queued:principal",
    "canal:sem_numero_livre",
    "pulado:opt_out",
    "pulado:suprimido",
    "ja_reservado",
    "erro_na_reserva:timeout",
  ])("quem usou o número ou foi vetado pelo canal ocupa (%s)", (detalhe) => {
    expect(ocupaONumero(r(detalhe))).toBe(true);
  });
});
