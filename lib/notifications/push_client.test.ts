/**
 * `encerrarPushDesteAparelho` — desligar os alertas e sair encerram o push do
 * aparelho: o servidor esquece a inscrição (DELETE, que precisa da sessão) e o
 * navegador cancela a dele. Nunca lança: a saída não pode depender da rede.
 *
 * Roda com: npx vitest run lib/notifications/push_client.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encerrarPushDesteAparelho } from "./push_client";

const ordem: string[] = [];
const fetchFalso = vi.fn(async (..._args: unknown[]) => {
  ordem.push("delete");
  return new Response(null, { status: 200 });
});
const unsubscribe = vi.fn(async () => {
  ordem.push("unsubscribe");
  return true;
});
const register = vi.fn();

function comServiceWorker(sub: { endpoint: string; unsubscribe: typeof unsubscribe } | null) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register,
      getRegistration: vi.fn(async () => ({ pushManager: { getSubscription: async () => sub } })),
    },
  });
}

beforeEach(() => {
  ordem.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchFalso);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("encerrarPushDesteAparelho", () => {
  it("manda o DELETE com o endpoint ANTES de cancelar a inscrição no navegador", async () => {
    comServiceWorker({ endpoint: "https://push/1", unsubscribe });
    await encerrarPushDesteAparelho();
    expect(ordem).toEqual(["delete", "unsubscribe"]);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/notifications/push");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe(JSON.stringify({ endpoint: "https://push/1" }));
  });

  it("DELETE falhando não impede o cancelamento, e a promessa resolve", async () => {
    fetchFalso.mockRejectedValueOnce(new Error("rede fora"));
    comServiceWorker({ endpoint: "https://push/1", unsubscribe });
    await expect(encerrarPushDesteAparelho()).resolves.toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cancelamento falhando também não lança", async () => {
    unsubscribe.mockRejectedValueOnce(new Error("x"));
    comServiceWorker({ endpoint: "https://push/1", unsubscribe });
    await expect(encerrarPushDesteAparelho()).resolves.toBeUndefined();
  });

  it("sem inscrição: nenhum pedido ao servidor", async () => {
    comServiceWorker(null);
    await encerrarPushDesteAparelho();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sem service worker no navegador: nenhum pedido e nenhum lançamento", async () => {
    await expect(encerrarPushDesteAparelho()).resolves.toBeUndefined();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("não registra service worker para sair", async () => {
    comServiceWorker({ endpoint: "https://push/1", unsubscribe });
    await encerrarPushDesteAparelho();
    expect(register).not.toHaveBeenCalled();
  });
});
