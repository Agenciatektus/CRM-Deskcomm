import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Dois `order/updated` do mesmo pedido (envio, depois entrega) emitem DOIS eventos.
 * Controle negativo: produto repetido continua deduplicado.
 */
const chamadas = vi.hoisted(() => ({ n: 0 }));
const rpc = vi.hoisted(() => vi.fn(async (_nome: string, _args?: unknown) => ({ data: "ev", error: null })));
vi.mock("@/lib/nuvemshop/cache-loja", () => ({ invalidarLojaDaOrg: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/nuvemshop/oauth", () => ({ verifyHmac: () => true }));
vi.mock("@/lib/supabase/admin", () => {
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "eq", "insert"]) cadeia[m] = () => cadeia;
  // 1ª leitura de cada POST = integração; a 2ª = "já registrei esse external_id".
  cadeia.maybeSingle = async () => ({
    data:
      chamadas.n++ === 0
        ? { id: "i1", organization_id: "org-1", webhook_secret_encrypted: "x" }
        : { id: "log-existente" },
    error: null,
  });
  cadeia.then = (ok: (v: unknown) => unknown) => ok({ error: null });
  return { createAdminClient: () => ({ from: () => cadeia, rpc }) };
});

import { POST } from "@/app/api/v1/webhooks/nuvemshop/[event]/route";

const chamar = (slug: string, id: number) =>
  POST(
    new NextRequest(`http://localhost/api/v1/webhooks/nuvemshop/${slug}`, {
      method: "POST",
      body: JSON.stringify({ store_id: 9999, id, event: slug }),
    }),
    { params: Promise.resolve({ event: slug }) },
  );

const emitidos = () =>
  rpc.mock.calls.filter((c) => c[0] === "emit_event");

beforeEach(() => {
  rpc.mockClear();
  chamadas.n = 0;
});

describe("webhook Nuvemshop: deduplicação", () => {
  it("order/updated repetido emite os dois eventos", async () => {
    await chamar("order-updated", 5);
    chamadas.n = 0;
    await chamar("order-updated", 5);
    expect(emitidos().map((c) => (c[1] as { p_event_type: string }).p_event_type)).toEqual([
      "nuvemshop.order_updated",
      "nuvemshop.order_updated",
    ]);
  });

  it("produto repetido continua deduplicado", async () => {
    await chamar("product-updated", 5);
    expect(emitidos()).toEqual([]);
  });
});
