import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * O webhook de produto da Nuvemshop apaga o produto do cache de estoque (1 h) da
 * organização dona da loja. Mede a LIGAÇÃO da rota: evento de pedido não toca no cache.
 */
const invalidar = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/nuvemshop/cache-loja", () => ({ invalidarLojaDaOrg: invalidar }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/nuvemshop/oauth", () => ({ verifyHmac: () => true }));
vi.mock("@/lib/supabase/admin", () => {
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "eq", "insert"]) cadeia[m] = () => cadeia;
  cadeia.maybeSingle = async () => ({
    data: { id: "i1", organization_id: "org-1", webhook_secret_encrypted: "x" },
    error: null,
  });
  cadeia.then = (ok: (v: unknown) => unknown) => ok({ error: null });
  return {
    createAdminClient: () => ({
      from: () => cadeia,
      rpc: async () => ({ data: "segredo", error: null }),
    }),
  };
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

beforeEach(() => invalidar.mockClear());

describe("webhook Nuvemshop x cache de estoque", () => {
  it.each([
    "product-created",
    "product-updated",
    "product-deleted",
    "order-created",
    "order-paid",
    "order-cancelled",
  ])("%s vira a época da org certa", async (slug) => {
    await chamar(slug, 1001);
    expect(invalidar).toHaveBeenCalledWith("org-1");
  });

  it("evento que não mexe no saldo não invalida", async () => {
    await chamar("order-updated", 77);
    expect(invalidar).not.toHaveBeenCalled();
  });
});
