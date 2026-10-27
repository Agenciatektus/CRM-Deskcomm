/**
 * Nuvemshop REST API client.
 *
 * Handles auth header (`Authentication: bearer <token>` — note lowercase
 * "bearer", per Nuvemshop spec) and User-Agent. Throws `NuvemshopApiError` on
 * non-2xx responses with structured info for the caller.
 */

import { APP_USER_AGENT, NUVEMSHOP_API_BASE, type NuvemshopEvent } from "./config";

export class NuvemshopApiError extends Error {
  status: number;
  code: string;
  body: string;

  constructor(status: number, code: string, body: string, message?: string) {
    super(message ?? `Nuvemshop API ${status} (${code})`);
    this.name = "NuvemshopApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface NuvemshopWebhook {
  id: number;
  event: string;
  url: string;
  created_at?: string;
  updated_at?: string;
}

export interface NuvemshopStore {
  id: number;
  name: Record<string, string> | string;
  business_name?: string;
  email?: string;
  url?: string;
  country?: string;
  main_currency?: string;
  main_language?: string;
}

interface ApiClientOptions {
  storeId: string;
  accessToken: string;
}

export class NuvemshopApiClient {
  private readonly storeId: string;
  private readonly accessToken: string;

  constructor({ storeId, accessToken }: ApiClientOptions) {
    if (!storeId) throw new Error("NuvemshopApiClient: storeId required");
    if (!accessToken) throw new Error("NuvemshopApiClient: accessToken required");
    this.storeId = storeId;
    this.accessToken = accessToken;
  }

  private url(path: string): string {
    const trimmed = path.startsWith("/") ? path : `/${path}`;
    return `${NUVEMSHOP_API_BASE}/${encodeURIComponent(this.storeId)}${trimmed}`;
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      Authentication: `bearer ${this.accessToken}`,
      "User-Agent": APP_USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(extra ?? {}),
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries429 = 0,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url(path), {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch (err) {
      throw new NuvemshopApiError(0, "network_error", String((err as Error).message));
    }

    const text = await res.text();
    if (res.status === 204 || text.length === 0) {
      return undefined as T;
    }

    if (!res.ok) {
      // A API não manda Retry-After no 429: a espera vem de `x-rate-limit-reset`
      // (ms até o balde repor), com teto curto para não segurar o turno do agente.
      if (res.status === 429 && retries429 > 0) {
        const espera = Number(res.headers.get("x-rate-limit-reset"));
        await new Promise((r) => setTimeout(r, Math.min(espera > 0 ? espera : 1000, 2000)));
        return this.request<T>(method, path, body, retries429 - 1);
      }
      const code =
        res.status === 401
          ? "unauthorized"
          : res.status === 403
            ? "forbidden"
            : res.status === 404
              ? "not_found"
              : res.status === 429
                ? "rate_limited"
                : res.status >= 500
                  ? "upstream_error"
                  : "request_failed";
      throw new NuvemshopApiError(res.status, code, text);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new NuvemshopApiError(res.status, "invalid_json", text);
    }
  }

  get<T>(path: string, retries429 = 0): Promise<T> {
    return this.request<T>("GET", path, undefined, retries429);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  delete(path: string): Promise<void> {
    return this.request<void>("DELETE", path);
  }

  // ---- Convenience wrappers ---------------------------------------------------

  getStore(): Promise<NuvemshopStore> {
    return this.get<NuvemshopStore>("/store");
  }

  listWebhooks(): Promise<NuvemshopWebhook[]> {
    return this.get<NuvemshopWebhook[]>("/webhooks");
  }

  createWebhook(event: NuvemshopEvent, url: string): Promise<NuvemshopWebhook> {
    return this.post<NuvemshopWebhook>("/webhooks", { event, url });
  }

  deleteWebhook(id: number): Promise<void> {
    return this.delete(`/webhooks/${id}`);
  }

  /** Busca ao vivo (nome, tags e SKU). Sem resultado a API responde 404, não lista vazia. */
  async buscarProdutos(termo: string, limite: number): Promise<unknown[]> {
    try {
      const r = await this.get<unknown>(
        `/products?q=${encodeURIComponent(termo)}&per_page=${limite}`,
        2,
      );
      return Array.isArray(r) ? r : [];
    } catch (err) {
      if (err instanceof NuvemshopApiError && err.status === 404) return [];
      throw err;
    }
  }
}
