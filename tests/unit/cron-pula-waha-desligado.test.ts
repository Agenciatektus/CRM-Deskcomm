/**
 * Com `WAHA_HABILITADO=false` o cron de saúde dos canais pula as linhas WAHA
 * sem consultar transporte, sem erro e sem `warn`, e segue vigiando os outros
 * providers. Ligado, a mesma linha é verificada (controle negativo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SEGREDO = "segredo-de-cron-do-interruptor";

vi.mock("@/lib/env", () => ({ env: { INTERNAL_CRON_SECRET: SEGREDO, INTERNAL_SECRET: "" } }));
vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null }));

const sincronizou = vi.fn();
vi.mock("@/lib/channels/health", () => ({
  sincronizarSaudeDaConexao: (...args: unknown[]) => {
    sincronizou(...args);
    return Promise.resolve("sem_mudanca");
  },
}));

const avisos = vi.fn();
const erros = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => avisos(...a), error: (...a: unknown[]) => erros(...a), info: vi.fn(), debug: vi.fn() },
}));

let linhas: Array<Record<string, unknown>> = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const cadeia: Record<string, unknown> = {};
      for (const m of ["select", "is", "eq", "update"]) cadeia[m] = () => cadeia;
      cadeia.limit = async () => ({ data: linhas, error: null });
      return cadeia;
    },
  }),
}));

const sessao = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: "s", organization_id: "org", status: "WORKING", display_name: null, phone_number: null,
  archived_at: null, provider: "waha", waha_session_name: "numero", meta_phone_number_id: null,
  zernio_account_id: null, ...over,
});

async function rodar() {
  const { GET } = await import("@/app/api/v1/cron/channel-health/route");
  const res = await GET({ headers: new Headers({ authorization: `Bearer ${SEGREDO}` }) } as never);
  return { status: res.status, body: ((await res.json()) as { data?: Record<string, unknown> }).data ?? {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  linhas = [sessao({})];
});
afterEach(() => vi.unstubAllEnvs());

describe("cron channel-health e o interruptor do WAHA", () => {
  it("desligado: pula a linha, sem consultar, sem warn e sem erro", async () => {
    vi.stubEnv("WAHA_HABILITADO", "false");
    const { status, body } = await rodar();
    expect(status).toBe(200);
    expect(body.verificadas).toBe(0);
    expect(sincronizou).not.toHaveBeenCalled();
    expect(avisos).not.toHaveBeenCalled();
    expect(erros).not.toHaveBeenCalled();
  });

  it("controle negativo, ligado: a mesma linha é verificada", async () => {
    const { body } = await rodar();
    expect(body.verificadas).toBe(1);
    expect(sincronizou).toHaveBeenCalledTimes(1);
  });
});
