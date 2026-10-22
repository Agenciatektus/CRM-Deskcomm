// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dono único do dreno de handlers: com o batimento do worker fresco, o cron sai
 * sem tocar no banco; velho ou ilegível, ele drena (rede de segurança).
 */

const drainEventLog = vi.fn(async () => ({ scanned: 0, done: 0, retried: 0, failed: 0, dead: 0 }));
const lerBatimento = vi.fn<() => Promise<number | null>>();
const criarArmazemDoBatimento = vi.fn(() => ({ get: vi.fn(), set: vi.fn() }) as unknown);

vi.mock("@/lib/event-log/drain", () => ({ drainEventLog }));
vi.mock("@/lib/event-log/register-handlers", () => ({ ensureHandlersRegistered: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: () => true }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/event-log/batimento-do-laco", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  lerBatimento,
  criarArmazemDoBatimento,
}));

async function chamar(): Promise<{ status: number; body: { data?: Record<string, unknown> } }> {
  const { GET } = await import("./route");
  const res = await GET(new Request("http://t/api/v1/cron/event-log-drain") as never);
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown> } };
}

describe("cron event-log-drain × batimento do worker", () => {
  beforeEach(() => {
    drainEventLog.mockClear();
    lerBatimento.mockReset();
    criarArmazemDoBatimento.mockClear();
  });

  it("batimento fresco: não drena", async () => {
    lerBatimento.mockResolvedValue(Date.now() - 5_000);
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(drainEventLog).not.toHaveBeenCalled();
    expect(JSON.stringify(r.body)).toContain("worker_drenando");
  });

  it("batimento velho: drena", async () => {
    lerBatimento.mockResolvedValue(Date.now() - 10 * 60_000);
    await chamar();
    expect(drainEventLog).toHaveBeenCalledTimes(1);
  });

  it("sem batimento (Redis fora ou chave perdida): drena", async () => {
    lerBatimento.mockResolvedValue(null);
    await chamar();
    expect(drainEventLog).toHaveBeenCalledTimes(1);
  });

  it("sem Redis configurado: drena sem tentar ler", async () => {
    criarArmazemDoBatimento.mockReturnValueOnce(null);
    await chamar();
    expect(lerBatimento).not.toHaveBeenCalled();
    expect(drainEventLog).toHaveBeenCalledTimes(1);
  });
});
