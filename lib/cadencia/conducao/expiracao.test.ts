import { describe, expect, it, vi } from "vitest";

import { MAX_CONDUCOES_EXPIRADAS_POR_TICK, varrerGatilhosDeTempo } from "../varredura-de-tempo";

describe("varredura de tempo — expiração da condução (14 dias)", () => {
  it("encerra as expiradas (CAS) antes dos gatilhos e conta só quem encerrou agora", async () => {
    const encerrar = vi.fn(async (_org: string, id: string) => id !== "c-2");
    const expiradas = vi.fn(async () => [
      { id: "c-1", organization_id: "o-1" },
      { id: "c-2", organization_id: "o-1" },
    ]);
    const r = await varrerGatilhosDeTempo({
      db: {
        cadenciasDeTempo: async () => [],
        candidatas: async () => [],
        conducoesExpiradas: expiradas,
        encerrarConducaoExpirada: encerrar,
      },
      inscrever: vi.fn(),
    });
    expect(expiradas).toHaveBeenCalledWith(MAX_CONDUCOES_EXPIRADAS_POR_TICK);
    expect(encerrar).toHaveBeenCalledWith("o-1", "c-1");
    expect(r.conducoesExpiradas).toBe(1);
  });

  it("sem o adapter de expiração (fakes antigos), a varredura segue como antes", async () => {
    const r = await varrerGatilhosDeTempo({
      db: { cadenciasDeTempo: async () => [], candidatas: async () => [] },
      inscrever: vi.fn(),
    });
    expect(r.conducoesExpiradas).toBe(0);
  });
});
