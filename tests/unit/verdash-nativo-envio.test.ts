import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ valor: {} as Record<string, unknown> }));
const credsMock = vi.hoisted(() => ({ valor: {} as Record<string, unknown> }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/verdash/credentials", async (orig) => ({
  ...(await orig<typeof import("@/lib/channels/verdash/credentials")>()),
  resolveVerdashCreds: async () => credsMock.valor,
}));
vi.mock("@/lib/channels/verdash/estado-nativo", async (orig) => ({
  ...(await orig<typeof import("@/lib/channels/verdash/estado-nativo")>()),
  estadoNativo: async () => estado.valor,
}));

import { verdashAdapter } from "@/lib/channels/adapters/verdash";
import { enviarComConsulta } from "@/lib/channels/verdash/envio-idempotente";

/**
 * ENVIO IDEMPOTENTE DA NATIVA. Testa a LIGACAO: `id` no corpo, header `token` da
 * instancia, query `Id` no status, e o que cada estado faz (enviar de novo ou nao).
 */

const ORG = "00000000-0000-4000-8000-0000000000a1";
const MSG = "11111111-1111-4111-8111-111111111111";
// O adapter manda ao FZAP o uuid em 32 hex maiúsculos (formato de id do WhatsApp).
const ID_FZAP = "11111111111141118111111111111111".toUpperCase();
const TOKEN = "token-da-instancia";

interface Chamada {
  method: string;
  path: string;
  search: string;
  token: string | undefined;
  body: Record<string, unknown> | undefined;
}
let chamadas: Chamada[];
let envios: Array<"ok" | "502" | "rede" | "400">;
let estadoDoStatus: string | "falha";

const env = (status: number, data?: unknown, error?: string) => ({
  ok: status < 300,
  status,
  statusText: error ?? "",
  json: async () => ({ code: status, success: status < 300, data, error }),
});

const fzap = (async (url: unknown, init?: RequestInit) => {
  const u = new URL(String(url));
  chamadas.push({
    method: init?.method ?? "GET",
    path: u.pathname,
    search: u.search,
    token: (init?.headers as Record<string, string> | undefined)?.token,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  });
  if (u.pathname === "/chat/send/status") {
    return estadoDoStatus === "falha" ? env(500, undefined, "x") : env(200, { state: estadoDoStatus });
  }
  if (u.pathname === "/chat/send/text") {
    const r = envios.shift() ?? "ok";
    if (r === "rede") throw new Error("timeout");
    if (r === "502") return env(502, undefined, "bad gateway");
    if (r === "400") return env(400, undefined, "invalido");
    return env(200, { id: MSG });
  }
  return env(404);
}) as unknown as typeof fetch;

const envelope = {
  organizationId: ORG,
  sessionRef: "crm-x-1",
  to: "5566999999999@s.whatsapp.net",
  providerConversationId: "5566999999999@s.whatsapp.net",
  kind: "text" as const,
  body: "oi",
  clientMessageId: MSG,
};
const nativa = { nativa: true, status: "WORKING", metadata: {}, lastStatusChangeAt: null };
const enviosDe = () => chamadas.filter((c) => c.path === "/chat/send/text");

beforeEach(() => {
  chamadas = [];
  envios = [];
  estadoDoStatus = "sent";
  estado.valor = { ...nativa };
  credsMock.valor = { instanceName: "crm-x-1", token: TOKEN, vinculoId: null, baseUrl: "http://fzap.interno" };
  vi.stubGlobal("fetch", fzap);
});
afterEach(() => vi.unstubAllGlobals());

describe("envio da nativa", () => {
  it("manda o id do CRM no corpo com o token da instancia", async () => {
    await verdashAdapter.send(envelope);
    const [c] = enviosDe();
    expect(c!.body!.id).toBe(ID_FZAP);
    expect(c!.token).toBe(TOKEN);
    expect(chamadas.some((x) => x.path === "/chat/send/status")).toBe(false);
  });

  it("vinculada: sem id no corpo e sem consulta (comportamento antigo)", async () => {
    estado.valor = { nativa: false, metadata: {} };
    await verdashAdapter.send(envelope);
    expect(enviosDe()[0]!.body!.id).toBeUndefined();
  });

  it("502 + sent: nao reenvia, consulta com Id e o token", async () => {
    envios = ["502"];
    await verdashAdapter.send(envelope);
    expect(enviosDe()).toHaveLength(1);
    const s = chamadas.find((x) => x.path === "/chat/send/status")!;
    expect(s.method).toBe("GET");
    expect(s.search).toBe(`?Id=${ID_FZAP}`);
    expect(s.token).toBe(TOKEN);
  });

  it("rede + not_found: reenvia UMA vez com o MESMO id", async () => {
    envios = ["rede", "ok"];
    estadoDoStatus = "not_found";
    await verdashAdapter.send(envelope);
    const e = enviosDe();
    expect(e).toHaveLength(2);
    expect(e[1]!.body!.id).toBe(ID_FZAP);
  });

  it("not_found e falha no reenvio: para (nao reenvia pela terceira vez)", async () => {
    envios = ["502", "502"];
    estadoDoStatus = "not_found";
    await expect(verdashAdapter.send(envelope)).rejects.toThrow(/verdash_request_failed: 502/);
    expect(enviosDe()).toHaveLength(2);
  });

  it("unknown: nunca reenvia, falha com codigo proprio", async () => {
    envios = ["502"];
    estadoDoStatus = "unknown";
    await expect(verdashAdapter.send(envelope)).rejects.toThrow(/^verdash_envio_incerto/);
    expect(enviosDe()).toHaveLength(1);
  });

  it("consulta de status que falha: incerto, sem reenviar", async () => {
    envios = ["rede"];
    estadoDoStatus = "falha";
    await expect(verdashAdapter.send(envelope)).rejects.toThrow(/^verdash_envio_incerto/);
    expect(enviosDe()).toHaveLength(1);
  });

  it("400 do FZAP propaga sem consultar status", async () => {
    envios = ["400"];
    await expect(verdashAdapter.send(envelope)).rejects.toThrow(/verdash_request_failed: 400/);
    expect(chamadas.some((x) => x.path === "/chat/send/status")).toBe(false);
  });

  it("STARTING com queda recente: falha rapido, sem falar com o FZAP", async () => {
    estado.valor = {
      ...nativa,
      status: "STARTING",
      metadata: { desconectado_em: new Date(Date.now() - 60_000).toISOString() },
    };
    await expect(verdashAdapter.send(envelope)).rejects.toThrow(/^verdash_nativo_reconectando/);
    expect(chamadas).toHaveLength(0);
  });
});

describe("enviarComConsulta: processing", () => {
  const creds = { instanceName: "i", token: TOKEN, vinculoId: null, baseUrl: "http://fzap.interno" };

  it("processing sempre: desiste como incerto, sem reenviar", async () => {
    estadoDoStatus = "processing";
    const enviar = vi.fn().mockRejectedValue(new Error("verdash_unreachable: timeout"));
    await expect(enviarComConsulta(creds, MSG, enviar, { esperaMs: 0 })).rejects.toThrow(/verdash_envio_incerto/);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(chamadas.filter((c) => c.path === "/chat/send/status")).toHaveLength(3);
  });
});
