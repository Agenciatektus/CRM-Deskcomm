import { describe, expect, it } from "vitest";

import {
  exigeDentroDoHorizonte,
  FOLGA_DO_ENCAIXE_MS,
  HORIZONTE_DO_ENCAIXE_MS,
} from "@/app/api/v1/agenda/agendamentos/_handler";
import { ApiError } from "@/lib/api/types";

/**
 * O encaixe (marcar fora da grade, só pessoa da equipe) recusa início no
 * passado e além de um ano (P2 de backend do Cassio na #171).
 */
const AGORA = new Date("2026-10-12T12:00:00Z");
const ctx = { requestId: "r-1" };
const em = (ms: number) => new Date(AGORA.getTime() + ms);

function codigo(inicio: Date): string | null {
  try {
    exigeDentroDoHorizonte(ctx, inicio, AGORA);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(422);
    return (e as ApiError).code;
  }
}

describe("encaixe dentro do horizonte", () => {
  it("ontem é recusado como horário no passado", () => {
    expect(codigo(em(-86_400_000))).toBe("agenda_horario_no_passado");
  });

  it("CONTROLE: dentro da folga de 5 min e daqui a uma hora, passa", () => {
    expect(codigo(em(-FOLGA_DO_ENCAIXE_MS + 1_000))).toBeNull();
    expect(codigo(em(3_600_000))).toBeNull();
  });

  it("um pouco além da folga já é passado", () => {
    expect(codigo(em(-FOLGA_DO_ENCAIXE_MS - 1_000))).toBe("agenda_horario_no_passado");
  });

  it("mais de um ano à frente é recusado; 364 dias passa", () => {
    expect(codigo(em(HORIZONTE_DO_ENCAIXE_MS + 60_000))).toBe("agenda_horario_longe_demais");
    expect(codigo(em(364 * 86_400_000))).toBeNull();
  });
});
