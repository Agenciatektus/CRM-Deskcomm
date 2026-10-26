import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/v1/health com o interruptor do WAHA.
 *
 * Desligado: a chave `waha` some e o geral segue 200 `healthy` com banco e Redis
 * ok, mesmo com o WAHA fora. Ligado e fora: 503, como sempre (controle negativo,
 * senão "200 desligado" também passaria se a rota nunca olhasse o WAHA).
 */
let ligado = true;

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://projeto.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    UPSTASH_REDIS_REST_URL: "https://redis.exemplo.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
    WAHA_API_BASE_URL: "https://waha.exemplo.com",
    WAHA_API_KEY: "chave",
    INTERNAL_CRON_SECRET: "x",
    INTERNAL_SECRET: "",
  },
  wahaHabilitado: () => ligado,
}));

const chamadas: string[] = [];

beforeEach(() => {
  vi.resetModules();
  chamadas.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      chamadas.push(String(url));
      if (String(url).includes("waha.exemplo.com")) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ result: "PONG" }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const pedido = () => new NextRequest("https://crm.exemplo.com.br/api/v1/health");

describe("health e o interruptor do WAHA", () => {
  it("desligado: 200 healthy, sem a chave e sem nem sondar o serviço", async () => {
    ligado = false;
    const { GET } = await import("@/app/api/v1/health/route");
    const res = await GET(pedido());
    const { data } = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(Object.keys(data.checks)).toEqual(["supabase", "redis"]);
    expect(chamadas.some((u) => u.includes("waha.exemplo.com"))).toBe(false);
  });

  it("ligado e fora do ar: 503 unhealthy (controle negativo)", async () => {
    ligado = true;
    const { GET } = await import("@/app/api/v1/health/route");
    const res = await GET(pedido());
    const { data } = await res.json();
    expect(res.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.checks.waha.status).toBe("down");
  });
});
