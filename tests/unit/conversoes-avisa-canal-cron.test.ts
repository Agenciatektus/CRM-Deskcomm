import { describe, expect, it, vi } from "vitest";

const paradas = vi.fn(async (): Promise<string[]> => ["org-parada"]);
vi.mock("@/lib/organizacao/operante", () => ({ idsDeOrgsParadas: () => paradas() }));

import { ORCAMENTO_DE_TEMPO_MS, reafirmarAvisosDeConversoes } from "@/app/api/v1/cron/conversoes-avisa-canal/route";

type Chamada = [unknown, string, { forcarInativo: boolean }];

/** Banco falso que respeita gt/lte/order/limit sobre a lista de organizações. */
function banco(orgs: string[], erro = false) {
  const filtros: Record<string, unknown> = {};
  const lista = [...orgs].sort();
  const q: Record<string, unknown> = {};
  let gt: string | null = null;
  let lte: string | null = null;
  q.select = () => q;
  q.eq = (c: string, v: unknown) => ((filtros[c] = v), q);
  q.gt = (_c: string, v: string) => ((gt = v), q);
  q.lte = (_c: string, v: string) => ((lte = v), q);
  q.order = () => q;
  q.limit = (n: number) => {
    if (erro) return Promise.resolve({ data: null, error: { message: "x" } });
    const fatia = lista.filter((o) => (gt === null || o > gt) && (lte === null || o <= lte)).slice(0, n);
    gt = null;
    lte = null;
    return Promise.resolve({ data: fatia.map((o) => ({ organization_id: o })), error: null });
  };
  return { admin: { from: () => q } as never, filtros };
}

describe("reafirmarAvisosDeConversoes", () => {
  it("todas as conexões Meta (sem filtro de enabled), parada forçada a inativo", async () => {
    paradas.mockResolvedValue(["org-parada"]);
    const { admin, filtros } = banco(["a", "org-parada", "b"]);
    const avisar = vi.fn(async () => ({ avisadas: 1, falhas: 0 }));
    const r = await reafirmarAvisosDeConversoes(admin, avisar);
    expect(filtros).toEqual({ platform: "meta_ads" });
    const chamadas = avisar.mock.calls as unknown as Chamada[];
    expect(chamadas.map((c) => c[1]).sort()).toEqual(["a", "b", "org-parada"]);
    expect(chamadas.find((c) => c[1] === "org-parada")![2].forcarInativo).toBe(true);
    expect(chamadas.find((c) => c[1] === "a")![2].forcarInativo).toBe(false);
    expect(r).toEqual({ organizacoes: 3, avisadas: 3, falhas: 0, adiadas: 0 });
  });

  it("conexão desabilitada também chama `avisar` (a porta reafirma o estado real)", async () => {
    paradas.mockResolvedValue([]);
    const avisar = vi.fn(async () => ({ avisadas: 1, falhas: 0 }));
    await reafirmarAvisosDeConversoes(banco(["desligada"]).admin, avisar);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it("lista de paradas ilegível: todas ouvem inativo, sem lançar", async () => {
    paradas.mockRejectedValue(new Error("banco fora"));
    const avisar = vi.fn(async () => ({ avisadas: 1, falhas: 0 }));
    await reafirmarAvisosDeConversoes(banco(["a", "b"]).admin, avisar);
    const chamadas = avisar.mock.calls as unknown as Chamada[];
    expect(chamadas).toHaveLength(2);
    expect(chamadas.every((c) => c[2].forcarInativo)).toBe(true);
  });

  it("rodada vazia não chama a porta", async () => {
    paradas.mockResolvedValue([]);
    const avisar = vi.fn();
    const r = await reafirmarAvisosDeConversoes(banco([]).admin, avisar);
    expect(avisar).not.toHaveBeenCalled();
    expect(r.organizacoes).toBe(0);
  });

  it("leitura quebrada: rodada vazia, sem lançar", async () => {
    paradas.mockResolvedValue([]);
    const avisar = vi.fn();
    await expect(reafirmarAvisosDeConversoes(banco([], true).admin, avisar)).resolves.toMatchObject({ organizacoes: 0 });
  });

  it("pagina além do teto e dá a volta no ciclo sem repetir organização", async () => {
    paradas.mockResolvedValue([]);
    const orgs = Array.from({ length: 450 }, (_, i) => `${(i % 16).toString(16)}-${String(i).padStart(4, "0")}`);
    const avisar = vi.fn(async () => ({ avisadas: 1, falhas: 0 }));
    const r = await reafirmarAvisosDeConversoes(banco(orgs).admin, avisar);
    const vistas = (avisar.mock.calls as unknown as Chamada[]).map((c) => c[1]);
    expect(vistas).toHaveLength(450);
    expect(new Set(vistas).size).toBe(450);
    expect(r.organizacoes).toBe(450);
  });

  it("estourou o orçamento de tempo: o resto fica adiado", async () => {
    paradas.mockResolvedValue([]);
    vi.useFakeTimers();
    try {
      const avisar = vi.fn(async () => {
        vi.advanceTimersByTime(ORCAMENTO_DE_TEMPO_MS + 1);
        return { avisadas: 1, falhas: 0 };
      });
      const r = await reafirmarAvisosDeConversoes(banco(["a", "b", "c"]).admin, avisar);
      expect(r.organizacoes).toBe(1);
      expect(r.adiadas).toBeGreaterThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
