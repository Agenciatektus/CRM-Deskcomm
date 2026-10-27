import { beforeEach, describe, expect, it, vi } from "vitest";
import { processPedido } from "@/lib/nuvemshop/pedidos.handler";
import { credenciaisDaLoja } from "@/lib/nuvemshop/credenciais";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLeadHandler, moveLeadHandler } from "@/app/api/v1/leads/_handler";

/** Fatia 4.3: o pedido vira UM card no funil "Pedidos do Site" e o MESMO card anda de etapa. */

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/nuvemshop/credenciais", () => ({ credenciaisDaLoja: vi.fn() }));
vi.mock("@/app/api/v1/leads/_handler", () => ({
  createLeadHandler: vi.fn(),
  moveLeadHandler: vi.fn(),
}));
const getOrder = vi.fn();
vi.mock("@/lib/nuvemshop/api-client", () => ({
  NuvemshopApiClient: class {
    getOrder = getOrder;
  },
}));

type Linha = Record<string, unknown>;
let orders: Map<string, Linha>;
let contatos: Linha[];
let funis: Linha[];
let etapas: Linha[];
let leads: Linha[];

function fakeAdmin() {
  return {
    from: (tabela: string) => {
      const f: Array<(l: Linha) => boolean> = [];
      let chave: Record<string, string> = {};
      const lista = () =>
        ({ contacts: contatos, crm_pipelines: funis, crm_stages: etapas, crm_leads: leads })[tabela]?.filter((l) =>
          f.every((p) => p(l)),
        ) ?? [];
      const q = {
        select: () => q,
        limit: () => q,
        match: (c: Record<string, string>) => ((chave = c), q),
        eq: (k: string, v: unknown) => (f.push((l) => l[k] === v), q),
        is: (k: string, v: unknown) => (f.push((l) => (l[k] ?? null) === v), q),
        in: (k: string, v: unknown[]) => (f.push((l) => v.includes(l[k])), q),
        maybeSingle: async () => ({
          data:
            tabela === "orders"
              ? (orders.get(`${chave.organization_id}|${chave.external_id}`) ?? null)
              : (lista()[0] ?? null),
          error: null,
        }),
        upsert: async (v: Linha) => {
          const k = `${v.organization_id}|${v.external_id}`;
          orders.set(k, { ...orders.get(k), ...v });
          return { error: null };
        },
        then: (ok: (r: unknown) => unknown) => ok({ data: lista(), error: null }),
      };
      return q;
    },
  };
}

const SLUGS = [
  "pedido-novo",
  "aguardando-pagamento",
  "pago-separando",
  "enviado-ou-pronto-para-retirar",
  "entregue",
  "cancelado-ou-com-problema",
];
const montaFunil = (org: string) => {
  funis.push({ id: `f-${org}`, organization_id: org, name: "Pedidos do Site" });
  SLUGS.forEach((slug, i) =>
    etapas.push({
      id: `${org}-${slug}`,
      organization_id: org,
      pipeline_id: `f-${org}`,
      slug,
      position: i + 1,
      is_archived: false,
    }),
  );
};
const pedido = (pay: string, ship: string, extra: Linha = {}) => ({
  id: 9001,
  number: 77,
  status: "open",
  payment_status: pay,
  shipping_status: ship,
  total: "10.00",
  contact_phone: "+5511999998888",
  created_at: "2026-10-20T10:00:00+0000",
  updated_at: "2026-10-20T10:00:00+0000",
  ...extra,
});
const evento = (org = "org-1") => ({
  id: "ev",
  organization_id: org,
  event_type: "nuvemshop.order_paid",
  entity_kind: "nuvemshop_webhook",
  entity_id: null,
  payload: { id: 9001 },
  metadata: {},
  consumed_by: [],
  attempts: 0,
});
const roda = async (pay: string, ship: string, org = "org-1") => {
  getOrder.mockResolvedValue(pedido(pay, ship));
  return processPedido(evento(org));
};
const etapaDoCard = () => leads.map((l) => l.stage_id);

beforeEach(() => {
  orders = new Map();
  funis = [];
  etapas = [];
  leads = [];
  contatos = [
    { id: "c1", organization_id: "org-1", is_anonymized: false, is_merged_into: null, phone_number: "+5511999998888" },
  ];
  getOrder.mockReset();
  vi.mocked(credenciaisDaLoja).mockResolvedValue({ accessToken: "t", storeId: "1" });
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);
  vi.mocked(createLeadHandler).mockReset().mockImplementation((async (_a: unknown, ctx: Linha, input: Linha) => {
    leads.push({ id: `l${leads.length + 1}`, organization_id: ctx.organization_id, source: input.source, external_id: input.external_id, stage_id: input.stage_id, title: input.title });
    return {};
  }) as never);
  vi.mocked(moveLeadHandler).mockReset().mockImplementation((async (_a: unknown, _c: unknown, id: string, i: Linha) => {
    leads.find((l) => l.id === id)!.stage_id = i.to_stage_id;
    return {};
  }) as never);
  montaFunil("org-1");
});

describe("card do pedido", () => {
  it("cria o card na etapa do status, sem dado do comprador no título", async () => {
    await roda("pending", "unpacked");
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ stage_id: "org-1-aguardando-pagamento", title: "Pedido #77", external_id: "9001" });
  });

  it("pago → enviado → entregue move o MESMO card", async () => {
    await roda("paid", "unpacked");
    expect(etapaDoCard()).toEqual(["org-1-pago-separando"]);
    await roda("paid", "shipped");
    await roda("paid", "delivered");
    expect(leads).toHaveLength(1);
    expect(etapaDoCard()).toEqual(["org-1-entregue"]);
    expect(createLeadHandler).toHaveBeenCalledTimes(1);
    expect(moveLeadHandler).toHaveBeenCalledTimes(2);
  });

  it("evento repetido não duplica nem move de novo", async () => {
    await roda("paid", "shipped");
    await roda("paid", "shipped");
    expect(leads).toHaveLength(1);
    expect(createLeadHandler).toHaveBeenCalledTimes(1);
    expect(moveLeadHandler).not.toHaveBeenCalled();
  });

  it("evento fora de ordem não regride", async () => {
    await roda("paid", "delivered");
    await roda("paid", "unpacked");
    expect(etapaDoCard()).toEqual(["org-1-entregue"]);
    expect(moveLeadHandler).not.toHaveBeenCalled();
  });

  it("cancelado vence e fica", async () => {
    await roda("paid", "shipped");
    await roda("voided", "unpacked");
    expect(etapaDoCard()).toEqual(["org-1-cancelado-ou-com-problema"]);
    await roda("paid", "delivered");
    expect(etapaDoCard()).toEqual(["org-1-cancelado-ou-com-problema"]);
    expect(moveLeadHandler).toHaveBeenCalledTimes(1);
  });

  it("sem contato não cria card nem contato", async () => {
    contatos = [];
    const res = await roda("paid", "unpacked");
    expect(res).toMatchObject({ status: "ok", detail: "sem_contato" });
    expect(leads).toHaveLength(0);
  });

  it("org sem o funil não faz nada e não muda o resultado do handler", async () => {
    funis = [];
    etapas = [];
    const res = await roda("paid", "unpacked");
    expect(res.detail).toBeUndefined();
    expect(createLeadHandler).not.toHaveBeenCalled();
  });

  it("funil sem uma das etapas conta como ausente", async () => {
    etapas = etapas.filter((e) => e.slug !== "entregue");
    await roda("paid", "unpacked");
    expect(createLeadHandler).not.toHaveBeenCalled();
  });

  it("controle negativo: funil de outra org não é tocado", async () => {
    funis = [];
    etapas = [];
    montaFunil("org-2");
    await roda("paid", "unpacked", "org-1");
    expect(createLeadHandler).not.toHaveBeenCalled();
    expect(leads).toHaveLength(0);
  });

  it("falha ao mover não derruba o upsert do pedido", async () => {
    await roda("paid", "unpacked");
    vi.mocked(moveLeadHandler).mockRejectedValue(Object.assign(new Error("dado do cliente"), { code: "409" }));
    const res = await roda("paid", "shipped");
    expect(res.status).toBe("ok");
    expect(res.detail).toBe("card_falhou:409");
    expect(orders.get("org-1|9001")?.status).toBe("shipped");
  });

  it("falha ao criar também não derruba o pedido", async () => {
    vi.mocked(createLeadHandler).mockRejectedValue(new Error("x"));
    const res = await roda("paid", "unpacked");
    expect(res).toMatchObject({ status: "ok", detail: "card_falhou:erro" });
    expect(orders.get("org-1|9001")).toBeDefined();
  });

  it("o handler chama o card DEPOIS de gravar o pedido", async () => {
    let gravadoAntes = false;
    vi.mocked(createLeadHandler).mockImplementation((async () => {
      gravadoAntes = orders.has("org-1|9001");
      return {};
    }) as never);
    await roda("paid", "unpacked");
    expect(gravadoAntes).toBe(true);
  });
});
