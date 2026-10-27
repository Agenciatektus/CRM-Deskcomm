import { beforeEach, describe, expect, it, vi } from "vitest";
import { dinheiroEmCentavos, mapearPedido, semRegredir } from "@/lib/nuvemshop/pedido-mapper";
import { processPedido, pedidosNuvemshopHandler } from "@/lib/nuvemshop/pedidos.handler";
import { eventLogTypeFor, SUBSCRIBED_EVENTS } from "@/lib/nuvemshop/config";
import { credenciaisDaLoja } from "@/lib/nuvemshop/credenciais";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureHandlersRegistered } from "@/lib/event-log/register-handlers";
import { getRegisteredHandlers } from "@/lib/event-log/dispatcher";

/**
 * PEDIDO DA NUVEMSHOP -> `orders` (fatia 4.1, só ingestão).
 *
 * O webhook chega duplicado e fora de ordem; o handler relê o pedido na API e
 * nunca regride o estado. O teste de ligação guarda a cicatriz do
 * `product_synced`: o nome que o webhook EMITE tem de ser o que o handler ASSINA.
 */

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/nuvemshop/credenciais", () => ({ credenciaisDaLoja: vi.fn() }));

const getOrder = vi.fn();
vi.mock("@/lib/nuvemshop/api-client", () => ({
  NuvemshopApiClient: class {
    getOrder = getOrder;
  },
}));

const pedido = (extra: Record<string, unknown> = {}) => ({
  id: 9001,
  status: "open",
  payment_status: "pending",
  shipping_status: "unpacked",
  total: "650.00",
  currency: "BRL",
  created_at: "2026-10-20T10:00:00+0000",
  updated_at: "2026-10-20T10:00:00+0000",
  ...extra,
});

describe("mapeamento", () => {
  const casos: Array<[Record<string, unknown>, string, string | null]> = [
    [{}, "pending", "unpacked"],
    [{ payment_status: "partially_paid" }, "pending", "unpacked"],
    [{ payment_status: "authorized" }, "paid", "unpacked"],
    [{ payment_status: "paid" }, "paid", "unpacked"],
    [{ payment_status: "paid", shipping_status: "unshipped" }, "paid", "packed"],
    [{ payment_status: "paid", shipping_status: "partially_packed" }, "paid", "packed"],
    [{ payment_status: "paid", shipping_status: "partially_fulfilled" }, "paid", "shipped"],
    [{ payment_status: "paid", shipping_status: "shipped" }, "shipped", "shipped"],
    [{ payment_status: "paid", shipping_status: "delivered" }, "delivered", "delivered"],
    [{ status: "cancelled", payment_status: "paid" }, "cancelled", "unpacked"],
    [{ payment_status: "voided" }, "cancelled", "unpacked"],
    [{ payment_status: "refunded", shipping_status: "delivered" }, "refunded", "delivered"],
    [{ shipping_status: undefined }, "pending", null],
  ];
  it.each(casos)("%j -> %s / %s", (extra, status, envio) => {
    const m = mapearPedido(pedido(extra));
    expect(m.status).toBe(status);
    expect(m.fulfillment_status).toBe(envio);
  });

  it("dinheiro sem float", () => {
    expect(dinheiroEmCentavos("650.00")).toBe(65000);
    expect(dinheiroEmCentavos("0.1")).toBe(10);
    expect(dinheiroEmCentavos("1234")).toBe(123400);
    expect(dinheiroEmCentavos("19.999")).toBe(1999);
    expect(dinheiroEmCentavos("4.35")).toBe(435);
    expect(() => dinheiroEmCentavos("abc")).toThrow();
  });

  it("rastreio, pagamento, cliente e pedido sem cliente", () => {
    const m = mapearPedido(
      pedido({
        fulfillments: [{ tracking_info: {} }, { tracking_info: { code: "BR123" } }],
        payment_details: { method: "credit_card" },
        customer: { id: 77 },
      }),
    );
    expect([m.tracking_code, m.payment_method, m.customer_external_id]).toEqual([
      "BR123",
      "credit_card",
      "77",
    ]);
    const s = mapearPedido(pedido());
    expect([s.tracking_code, s.payment_method, s.customer_external_id]).toEqual([null, null, null]);
  });

  it("nunca regride", () => {
    const atual = { status: "delivered" as const, fulfillment_status: "delivered" as const, tracking_code: "X" };
    const r = semRegredir(mapearPedido(pedido({ payment_status: "paid", shipping_status: "shipped" })), atual);
    expect([r.status, r.fulfillment_status, r.tracking_code]).toEqual(["delivered", "delivered", "X"]);
    const c = semRegredir(mapearPedido(pedido({ payment_status: "paid" })), { ...atual, status: "cancelled" });
    expect(c.status).toBe("cancelled");
    const avanca = semRegredir(mapearPedido(pedido({ payment_status: "refunded" })), { ...atual, status: "paid" });
    expect(avanca.status).toBe("refunded");
  });
});

// Banco em memória: um "orders" por chave, como o unique do schema.
let linhas: Map<string, Record<string, unknown>>;
function fakeAdmin() {
  return {
    from: (tabela: string) => {
      expect(tabela).toBe("orders");
      let chave: Record<string, string> = {};
      const q = {
        select: () => q,
        match: (c: Record<string, string>) => {
          chave = c;
          return q;
        },
        maybeSingle: async () => ({
          data: linhas.get(`${chave.organization_id}|${chave.external_id}`) ?? null,
          error: null,
        }),
        upsert: async (v: Record<string, unknown>) => {
          linhas.set(`${v.organization_id}|${v.external_id}`, v);
          return { error: null };
        },
      };
      return q;
    },
  };
}

const evento = (org = "org-1") => ({
  id: "ev",
  organization_id: org,
  event_type: "nuvemshop.order_paid",
  entity_kind: "nuvemshop_webhook",
  entity_id: null,
  payload: { store_id: 1, event: "order/paid", id: 9001 },
  metadata: {},
  consumed_by: [],
  attempts: 0,
});

beforeEach(() => {
  linhas = new Map();
  getOrder.mockReset();
  vi.mocked(credenciaisDaLoja).mockResolvedValue({ accessToken: "t", storeId: "1" });
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);
});

const COMPRADOR = {
  customer: { id: 77, name: "Maria", email: "m@x.com", identification: "123.456.789-00" },
  contact_name: "Maria",
  contact_email: "m@x.com",
  contact_phone: "+5511999999999",
  contact_identification: "12345678900",
  billing_name: "Maria",
  billing_address: "Rua A",
  billing_phone: "1",
  shipping_address: { address: "Rua B", zipcode: "01000-000" },
  shipping_name: "Maria",
  client_details: { browser_ip: "1.2.3.4", user_agent: "x" },
  browser_ip: "1.2.3.4",
  note: "deixar com o porteiro Joao",
};

describe("LGPD: payload sem dado pessoal", () => {
  it("só a lista fixa; nenhuma chave pessoal em profundidade", () => {
    const m = mapearPedido(
      pedido({
        ...COMPRADOR,
        products: [{ id: 1, product_id: 2, name: "Tênis", quantity: 1, price: "10.00", customer_note: "x" }],
        fulfillments: [{ id: 5, status: "x", tracking_info: { code: "BR1", address: "Rua C" }, address: "Rua C" }],
      }),
    );
    const json = JSON.stringify(m.payload);
    for (const proibido of ["Maria", "m@x.com", "Rua", "1.2.3.4", "123.456", "porteiro", "99999", "01000"]) {
      expect(json).not.toContain(proibido);
    }
    expect(m.payload).toMatchObject({ id: 9001, total: "650.00" });
    expect(m.payload["fulfillments"]).toEqual([{ id: 5, status: "x", tracking_info: { code: "BR1" } }]);
    expect(m.customer_external_id).toBe("77");
  });

  it("linha anonimizada não é reescrita", async () => {
    linhas = new Map([["org-1|9001", { is_anonymized: true, status: "paid", payload: {} }]]);
    getOrder.mockResolvedValue(pedido({ payment_status: "paid", ...COMPRADOR }));
    expect(await processPedido(evento())).toMatchObject({ status: "skipped", detail: "anonimizado" });
    expect(linhas.get("org-1|9001")).toEqual({ is_anonymized: true, status: "paid", payload: {} });
  });
});

describe("dado ruim vira skipped", () => {
  it("created_at ausente e total inválido", async () => {
    getOrder.mockResolvedValueOnce(pedido({ created_at: undefined }));
    expect(await processPedido(evento())).toMatchObject({ status: "skipped", detail: "created_at_ausente" });
    getOrder.mockResolvedValueOnce(pedido({ total: "abc" }));
    expect(await processPedido(evento())).toMatchObject({ status: "skipped", detail: "total_invalido" });
    expect(linhas.size).toBe(0);
  });
});

describe("handler", () => {
  it("grava, e o mesmo evento 2x não duplica", async () => {
    getOrder.mockResolvedValue(pedido({ payment_status: "paid" }));
    expect((await processPedido(evento())).status).toBe("ok");
    expect((await processPedido(evento())).status).toBe("ok");
    expect(linhas.size).toBe(1);
    const l = [...linhas.values()][0];
    expect(l).toMatchObject({
      organization_id: "org-1",
      external_provider: "nuvemshop",
      external_id: "9001",
      status: "paid",
      total_cents: 65000,
    });
    expect(l).not.toHaveProperty("contact_id");
  });

  it("fora de ordem: leitura velha depois da nova não regride", async () => {
    getOrder.mockResolvedValueOnce(
      pedido({ payment_status: "paid", shipping_status: "delivered", updated_at: "2026-10-22T10:00:00+0000" }),
    );
    await processPedido(evento());
    // Mesmo carimbo remoto, estado menor (leitura em cache da plataforma).
    getOrder.mockResolvedValueOnce(
      pedido({ payment_status: "paid", shipping_status: "shipped", updated_at: "2026-10-22T10:00:00+0000" }),
    );
    await processPedido(evento());
    expect([...linhas.values()][0]).toMatchObject({ status: "delivered", fulfillment_status: "delivered" });
    // E carimbo mais antigo nem grava.
    getOrder.mockResolvedValueOnce(pedido({ updated_at: "2026-10-21T10:00:00+0000" }));
    expect(await processPedido(evento())).toMatchObject({ status: "skipped", detail: "pedido_mais_antigo" });
  });

  it("orgs diferentes não se misturam", async () => {
    getOrder.mockResolvedValue(pedido());
    await processPedido(evento("org-1"));
    await processPedido(evento("org-2"));
    expect(linhas.size).toBe(2);
  });

  it("loja desconectada e pedido 404 pulam sem erro", async () => {
    vi.mocked(credenciaisDaLoja).mockResolvedValueOnce(null);
    expect(await processPedido(evento())).toMatchObject({ status: "skipped", detail: "loja_nao_conectada" });
    getOrder.mockResolvedValue(null);
    expect(await processPedido(evento())).toMatchObject({ status: "skipped", detail: "pedido_nao_encontrado" });
    expect(linhas.size).toBe(0);
  });
});

describe("ligação webhook -> handler", () => {
  it("o handler está registrado e assina exatamente o que o webhook emite", () => {
    // Mesma função que a rota usa para nomear o que emite.
    const emitidos = SUBSCRIBED_EVENTS.filter((e) => e.startsWith("order/")).map(eventLogTypeFor);
    expect(emitidos).toContain("nuvemshop.order_updated");
    expect([...pedidosNuvemshopHandler.events].sort()).toEqual([...emitidos].sort());

    ensureHandlersRegistered();
    const reg = getRegisteredHandlers().find((h) => h.key === pedidosNuvemshopHandler.key);
    expect(reg).toBeDefined();
    for (const e of emitidos) expect(reg!.events).toContain(e);
  });
});
