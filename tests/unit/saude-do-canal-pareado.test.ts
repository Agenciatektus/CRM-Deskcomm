import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O CANAL PAREADO ERA DECLARADO CAÍDO ENQUANTO FUNCIONAVA.
 *
 * ─── O defeito medido ───────────────────────────────────────────────────────
 *
 * O canal `verdash` tem dois modos. No DIRETO, o token guardado é o da própria
 * instância no servidor de WhatsApp. No PAREADO, é um token de MÁQUINA emitido
 * pela Verdash — que o servidor de WhatsApp nunca viu.
 *
 * `verdashEnviar` sempre soube disso e se desvia por `crm-enviar-mensagem`.
 * `checkHealth` não: entregava o token de máquina ao FZAP, colhia 401 e o
 * traduzia como "a credencial da instância não vale mais" → `FAILED`.
 *
 * Em 24/09/2026 isso aconteceu no número do Felipe (Lior): a instância estava
 * `connected` na Verdash, mensagem entrava e saía pelos dois webhooks, e a
 * Central abriu alarme CRÍTICO de canal fora do ar. Um alarme que grita numa
 * linha saudável é pior que nenhum — ele ensina a ignorar a cor.
 *
 * ─── Por que cada caso existe ───────────────────────────────────────────────
 *
 * O primeiro é o invariante que de fato pega a regressão: no modo pareado a
 * pergunta vai para a VERDASH. Se alguém remover o ramo, a URL chamada muda e o
 * caso cai — sem precisar de banco, de rede ou de instância viva.
 *
 * Os outros separam desfechos que a tentação junta: "reconectando" não é
 * "caiu", e "não consegui perguntar" não é nenhum dos dois.
 */

const creds = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) as never }));
vi.mock("@/lib/channels/verdash/credentials", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveVerdashCreds: (...a: unknown[]) => creds(...(a as [])),
}));

const ORG = "00000000-0000-4000-8000-000000000924";

function comVinculo() {
  return {
    instanceName: "0b24dda6-577b-458d-957d-4c502877b930",
    token: "token-de-maquina-com-mais-de-32-caracteres",
    vinculoId: "11111111-2222-4333-8444-555555555555",
    baseUrl: "http://fzap.interno:8081",
  };
}
function semVinculo() {
  return {
    instanceName: "tektus-dr-paulo-torres",
    token: "token-da-instancia-no-servidor-de-whats",
    vinculoId: null,
    baseUrl: "http://fzap.interno:8081",
  };
}

/** Guarda a URL chamada: é nela que o desvio se prova. */
const urlsChamadas: string[] = [];

function respondeCom(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return vi.fn(async (url: unknown) => {
    urlsChamadas.push(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      json: async () => body,
    };
  }) as unknown as typeof fetch;
}

const fetchOriginal = globalThis.fetch;

async function saude() {
  const { verdashAdapter } = await import("@/lib/channels/adapters/verdash");
  return verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: "seja-qual-for" });
}

beforeEach(() => {
  urlsChamadas.length = 0;
  creds.mockReset();
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe("modo pareado", () => {
  it("pergunta à Verdash, nunca ao servidor de WhatsApp", async () => {
    creds.mockResolvedValue(comVinculo());
    globalThis.fetch = respondeCom({
      success: true,
      data: { conectada: true, reconectando: false },
    });

    const r = await saude();

    expect(r).toMatchObject({ reachable: true, status: "WORKING" });
    expect(urlsChamadas).toHaveLength(1);
    expect(urlsChamadas[0]).toContain("/crm-status-instancia");
    // O ponto inteiro: o token de máquina não pode chegar ao FZAP.
    expect(urlsChamadas[0]).not.toContain("/session/status");
    expect(urlsChamadas[0]).not.toContain("fzap.interno");
  });

  it("instância reconectando é STARTING, não queda", async () => {
    creds.mockResolvedValue(comVinculo());
    globalThis.fetch = respondeCom({
      success: true,
      data: { conectada: true, reconectando: true },
    });

    expect(await saude()).toMatchObject({ reachable: true, status: "STARTING" });
  });

  it("instância desconectada na Verdash é FAILED", async () => {
    creds.mockResolvedValue(comVinculo());
    globalThis.fetch = respondeCom({
      success: true,
      data: { conectada: false, reconectando: false },
    });

    expect(await saude()).toMatchObject({ reachable: true, status: "FAILED" });
  });

  it("401 é acesso revogado — e diz isso, para não mandar ninguém caçar token de instância", async () => {
    creds.mockResolvedValue(comVinculo());
    globalThis.fetch = respondeCom({ error: "nao_autorizado" }, { status: 401 });

    expect(await saude()).toMatchObject({
      reachable: true,
      status: "FAILED",
      detail: "acesso_revogado_na_verdash",
    });
  });

  it("Verdash fora do ar é 'não sei', não 'caiu'", async () => {
    creds.mockResolvedValue(comVinculo());
    globalThis.fetch = vi.fn(async () => {
      throw new Error("conexao recusada");
    }) as unknown as typeof fetch;

    expect(await saude()).toMatchObject({ reachable: false, status: null });
  });
});

describe("modo direto segue intocado", () => {
  it("continua perguntando ao servidor de WhatsApp", async () => {
    creds.mockResolvedValue(semVinculo());
    globalThis.fetch = respondeCom({ success: true, data: { connected: true, loggedIn: true } });

    const r = await saude();

    expect(r).toMatchObject({ reachable: true, status: "WORKING" });
    expect(urlsChamadas[0]).toContain("/session/status");
  });
});
