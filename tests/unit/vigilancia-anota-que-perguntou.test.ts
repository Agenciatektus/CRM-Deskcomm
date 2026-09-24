/**
 * A TELA DIZIA "AINDA NÃO VERIFICADO" COM A VARREDURA RODANDO POR TRÁS.
 *
 * ─── O defeito ──────────────────────────────────────────────────────────────
 *
 * `channel_sessions.last_health_check_at` é o que a tela de Conexões mostra
 * como "Verificado <data>" (`components/connections/ConnectionsClient.tsx`).
 * Os únicos lugares que o escreviam eram a abertura MANUAL de um canal e o
 * onboarding. A varredura de 5 em 5 minutos — que é a vigilância de verdade —
 * só tocava a linha quando o status MUDAVA.
 *
 * Resultado: um canal saudável, verificado 288 vezes por dia, exibia "Ainda não
 * verificado" para sempre. A frase que deveria dar confiança ao operador dizia
 * exatamente o contrário do que acontecia — e quem lê isso conclui que ninguém
 * está olhando, que é a conclusão errada e cara.
 *
 * ─── Por que só quando houve resposta ───────────────────────────────────────
 *
 * "Verificado" precisa significar que a pergunta foi respondida. Carimbar a
 * hora de uma tentativa que não chegou a lugar nenhum faria a tela afirmar uma
 * vigilância que não existiu — o mesmo vício, com o sinal trocado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SEGREDO = "segredo-de-cron";

vi.mock("@/lib/env", () => ({
  env: { INTERNAL_CRON_SECRET: SEGREDO, INTERNAL_SECRET: "" },
}));
vi.mock("@/lib/channels/health", () => ({
  sincronizarSaudeDaConexao: () => Promise.resolve("sem_mudanca"),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** O que o adapter falso responde nesta rodada. */
let resposta: { reachable: boolean; status: string | null; detail: string | null } = {
  reachable: true,
  status: "WORKING",
  detail: null,
};

vi.mock("@/lib/channels", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdapterOpcional: () => ({ checkHealth: async () => resposta }),
  canalConhecidoSemMensagem: () => false,
  resolveSessionRef: () => "ref",
}));

let linhas: Array<Record<string, unknown>> = [];
const atualizou = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const cadeia: Record<string, unknown> = {};
      for (const m of ["select", "is", "eq"]) cadeia[m] = () => cadeia;
      cadeia.update = (patch: unknown) => {
        atualizou(patch);
        return cadeia;
      };
      cadeia.limit = async () => ({ data: linhas, error: null });
      return cadeia;
    },
  }),
}));

function sessao(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sess",
    organization_id: "org",
    status: "WORKING",
    display_name: "Felipe Comercial",
    phone_number: null,
    archived_at: null,
    provider: "verdash",
    ...over,
  };
}

async function rodar() {
  const { GET } = await import("@/app/api/v1/cron/channel-health/route");
  const res = await GET({ headers: new Headers({ authorization: `Bearer ${SEGREDO}` }) } as never);
  return res.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  linhas = [sessao()];
  resposta = { reachable: true, status: "WORKING", detail: null };
});

describe("a varredura anota que perguntou", () => {
  it("carimba a verificação mesmo quando o status não mudou", async () => {
    expect(await rodar()).toBe(200);
    expect(atualizou).toHaveBeenCalledTimes(1);
    const patch = atualizou.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.last_health_check_at).toEqual(expect.any(String));
    // Status igual não pode virar "mudou de status": a tela mostra há quanto
    // tempo a conexão está estável, e reescrever isso a cada rodada zeraria
    // o único número que conta essa história.
    expect(patch).not.toHaveProperty("last_status_change_at");
  });

  it("status novo carimba as duas coisas numa escrita só", async () => {
    resposta = { reachable: true, status: "FAILED", detail: "x" };
    expect(await rodar()).toBe(200);
    expect(atualizou).toHaveBeenCalledTimes(1);
    const patch = atualizou.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.status).toBe("FAILED");
    expect(patch.last_health_check_at).toEqual(expect.any(String));
    expect(patch.last_status_change_at).toEqual(expect.any(String));
  });

  it("pergunta que não chegou a ser respondida NÃO vira 'verificado'", async () => {
    resposta = { reachable: false, status: null, detail: "fetch failed" };
    expect(await rodar()).toBe(200);
    expect(atualizou).not.toHaveBeenCalled();
  });
});
