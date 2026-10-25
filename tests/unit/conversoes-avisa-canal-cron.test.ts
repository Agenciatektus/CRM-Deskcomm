import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/organizacao/operante", () => ({ idsDeOrgsParadas: vi.fn(async () => ["org-parada"]) }));

import { ORCAMENTO_DE_TEMPO_MS, reafirmarAvisosDeConversoes } from "@/app/api/v1/cron/conversoes-avisa-canal/route";

function banco(orgs: string[], erro = false) {
  const filtros: Record<string, unknown> = {};
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (c: string, v: unknown) => ((filtros[c] = v), q);
  q.order = () => q;
  q.limit = () => Promise.resolve(erro ? { data: null, error: { message: "x" } } : { data: orgs.map((o) => ({ organization_id: o })), error: null });
  return { admin: { from: () => q } as never, filtros };
}

describe("reafirmarAvisosDeConversoes", () => {
  it("só conexões Meta habilitadas, sem organização parada, somando o resultado", async () => {
    const { admin, filtros } = banco(["a", "org-parada", "b"]);
    const avisar = vi.fn(async () => ({ avisadas: 1, falhas: 0 }));
    const r = await reafirmarAvisosDeConversoes(admin, avisar);
    expect(filtros).toEqual({ platform: "meta_ads", enabled: true });
    expect(avisar.mock.calls.map((c) => (c as unknown[])[1])).toEqual(["a", "b"]);
    expect(r).toEqual({ organizacoes: 2, avisadas: 2, falhas: 0, adiadas: 0 });
  });

  it("rodada vazia não chama a porta", async () => {
    const avisar = vi.fn();
    const r = await reafirmarAvisosDeConversoes(banco([]).admin, avisar);
    expect(avisar).not.toHaveBeenCalled();
    expect(r.organizacoes).toBe(0);
  });

  it("leitura quebrada: rodada vazia, sem lançar", async () => {
    const avisar = vi.fn();
    await expect(reafirmarAvisosDeConversoes(banco([], true).admin, avisar)).resolves.toMatchObject({ organizacoes: 0 });
  });

  it("estourou o orçamento de tempo: o resto fica adiado", async () => {
    vi.useFakeTimers();
    try {
      const avisar = vi.fn(async () => {
        vi.advanceTimersByTime(ORCAMENTO_DE_TEMPO_MS + 1);
        return { avisadas: 1, falhas: 0 };
      });
      const r = await reafirmarAvisosDeConversoes(banco(["a", "b", "c"]).admin, avisar);
      expect(r).toMatchObject({ organizacoes: 1, adiadas: 2 });
    } finally {
      vi.useRealTimers();
    }
  });
});
