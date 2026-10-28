import { beforeEach, describe, expect, it, vi } from "vitest";
import { processPedido } from "@/lib/nuvemshop/pedidos.handler";
import { credenciaisDaLoja } from "@/lib/nuvemshop/credenciais";
import { createAdminClient } from "@/lib/supabase/admin";

/** Fatia 4.2: liga o pedido ao contato da org (cria quando ninguém casa); nunca desliga. */

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/nuvemshop/credenciais", () => ({ credenciaisDaLoja: vi.fn() }));
const getOrder = vi.fn();
vi.mock("@/lib/nuvemshop/api-client", () => ({
  NuvemshopApiClient: class {
    getOrder = getOrder;
  },
}));

type Linha = Record<string, unknown>;
let orders: Map<string, Linha>;
let contatos: Linha[];
let contatosCriados: Linha[];
let erroNoInsert: { code: string } | null;

function fakeAdmin() {
  return {
    from: (tabela: string) => {
      const f: Array<(l: Linha) => boolean> = [];
      let chave: Record<string, string> = {};
      const q = {
        select: () => q,
        limit: () => q,
        match: (c: Record<string, string>) => ((chave = c), q),
        eq: (k: string, v: unknown) => (f.push((l) => l[k] === v), q),
        is: (k: string, v: unknown) => (f.push((l) => (l[k] ?? null) === v), q),
        in: (k: string, v: unknown[]) => (f.push((l) => v.includes(l[k])), q),
        maybeSingle: async () => ({
          data: orders.get(`${chave.organization_id}|${chave.external_id}`) ?? null,
          error: null,
        }),
        upsert: async (v: Linha) => {
          const k = `${v.organization_id}|${v.external_id}`;
          orders.set(k, { ...orders.get(k), ...v });
          return { error: null };
        },
        insert: (v: Linha) => {
          if (!erroNoInsert) {
            const novo = { id: `novo-${contatosCriados.length + 1}`, is_anonymized: false, is_merged_into: null, ...v };
            contatosCriados.push(novo);
            contatos.push({ ...novo, email_normalized: typeof v.email === "string" ? v.email.toLowerCase() : null });
          }
          return q;
        },
        single: async () =>
          erroNoInsert
            ? { data: null, error: erroNoInsert }
            : { data: { id: contatosCriados.at(-1)?.id }, error: null },
        then: (ok: (r: unknown) => unknown) =>
          ok({
            data: tabela === "contacts" ? contatos.filter((l) => f.every((p) => p(l))).slice(0, 2) : [],
            error: null,
          }),
      };
      return q;
    },
  };
}

const contato = (id: string, extra: Linha = {}): Linha => ({
  id,
  organization_id: "org-1",
  is_anonymized: false,
  is_merged_into: null,
  phone_number: null,
  email_normalized: null,
  ...extra,
});
const pedido = (extra: Linha = {}) => ({
  id: 9001,
  status: "open",
  payment_status: "paid",
  shipping_status: "unpacked",
  total: "10.00",
  created_at: "2026-10-20T10:00:00+0000",
  updated_at: "2026-10-20T10:00:00+0000",
  ...extra,
});
const evento = {
  id: "ev",
  organization_id: "org-1",
  event_type: "nuvemshop.order_paid",
  entity_kind: "nuvemshop_webhook",
  entity_id: null,
  payload: { id: 9001 },
  metadata: {},
  consumed_by: [],
  attempts: 0,
};
const gravado = () => orders.get("org-1|9001");

beforeEach(() => {
  orders = new Map();
  contatos = [];
  contatosCriados = [];
  erroNoInsert = null;
  getOrder.mockReset();
  vi.mocked(credenciaisDaLoja).mockResolvedValue({ accessToken: "t", storeId: "1" });
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as never);
});

describe("casamento por telefone", () => {
  it.each([
    ["com DDI e com 9", "+5511999998888"],
    ["sem DDI", "(11) 99999-8888"],
    ["sem o 9", "551199998888"],
  ])("contato guardado com 9 casa com %s", async (_n, tel) => {
    contatos = [contato("c1", { phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: tel }));
    expect(await processPedido(evento)).toMatchObject({ status: "ok" });
    expect(gravado()?.contact_id).toBe("c1");
  });

  it("contato guardado sem o 9 casa com o número com 9", async () => {
    contatos = [contato("c1", { phone_number: "+551199998888" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("c1");
  });

  it("telefone vence o e-mail; e-mail casa quando só ele existe", async () => {
    contatos = [contato("t", { phone_number: "+5511999998888" }), contato("e", { email_normalized: "m@x.com" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "11999998888", contact_email: "M@x.com" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("t");
    orders.clear();
    getOrder.mockResolvedValue(pedido({ contact_email: " M@x.com " }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("e");
  });
});

describe("sem casamento", () => {
  it("ambíguo: dois contatos com o mesmo telefone deixam NULL e avisam", async () => {
    contatos = [contato("a", { phone_number: "+5511999998888" }), contato("b", { phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    expect(await processPedido(evento)).toMatchObject({ status: "ok", detail: "contato_ambiguo" });
    expect(gravado()).not.toHaveProperty("contact_id");
  });

  it("contato de OUTRA org não casa (controle negativo)", async () => {
    contatos = [contato("x", { organization_id: "org-2", phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("novo-1");
    expect(contatosCriados).toHaveLength(1);
  });

  it("anonimizado e mesclado não casam", async () => {
    contatos = [
      contato("an", { phone_number: "+5511999998888", is_anonymized: true }),
      contato("me", { phone_number: "+5511999998888", is_merged_into: "z" }),
    ];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("novo-1");
    expect(contatosCriados).toHaveLength(1);
  });

  it("número estrangeiro não ganha 55: +46 8123 4567 não casa com o DDD 46 do Paraná", async () => {
    contatos = [contato("pr", { phone_number: "+5546981234567" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+4681234567" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("novo-1");
    expect(contatosCriados).toHaveLength(1);
  });

  it("fixo com 9 grudado não casa com o fixo de outra pessoa", async () => {
    contatos = [contato("fixo", { phone_number: "+553132345678" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5531932345678" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("novo-1");
    expect(contatosCriados).toHaveLength(1);
  });

  it("ambíguo também por e-mail", async () => {
    contatos = [contato("a", { email_normalized: "m@x.com" }), contato("b", { email_normalized: "m@x.com" })];
    getOrder.mockResolvedValue(pedido({ contact_email: "m@x.com" }));
    expect(await processPedido(evento)).toMatchObject({ status: "ok", detail: "contato_ambiguo" });
    expect(gravado()).not.toHaveProperty("contact_id");
  });

  it("erro na busca: detail só leva o código, sem telefone nem e-mail", async () => {
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888", contact_email: "m@x.com" }));
    const admin = fakeAdmin();
    vi.mocked(createAdminClient).mockReturnValue({
      from: (t: string) => {
        const q = admin.from(t) as Record<string, unknown>;
        if (t === "contacts") q.then = (ok: (r: unknown) => unknown) => ok({ data: null, error: { code: "42P01" } });
        return q;
      },
    } as never);
    const r = await processPedido(evento);
    expect(r).toMatchObject({ status: "error", detail: "contato:42P01" });
    expect(JSON.stringify(r)).not.toMatch(/99999|m@x\.com/);
  });

  it("sem telefone e sem e-mail: NULL, e nenhum contato é criado", async () => {
    contatos = [contato("c1", { phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(pedido());
    expect(await processPedido(evento)).toMatchObject({ status: "ok" });
    expect(gravado()).not.toHaveProperty("contact_id");
    expect(contatosCriados).toHaveLength(0);
  });

  it("ambíguo nunca cria contato", async () => {
    contatos = [contato("a", { phone_number: "+5511999998888" }), contato("b", { phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    await processPedido(evento);
    expect(contatosCriados).toHaveLength(0);
  });
});

describe("comprador novo", () => {
  it("cria o contato sem consentimento, com origem da loja, e liga o pedido", async () => {
    getOrder.mockResolvedValue(
      pedido({ contact_phone: "(11) 99999-8888", contact_email: " Maria@X.com ", contact_name: "Maria Souza" }),
    );
    expect(await processPedido(evento)).toMatchObject({ status: "ok", detail: "contato_criado" });
    expect(contatosCriados).toEqual([
      expect.objectContaining({
        organization_id: "org-1",
        name: "Maria Souza",
        phone_number: "+5511999998888",
        email: "maria@x.com",
        source: "nuvemshop",
        source_metadata: { via: "pedido_loja" },
        consent: {},
      }),
    ]);
    expect(gravado()?.contact_id).toBe("novo-1");
  });

  it("só com e-mail também cria; o mesmo comprador no 2º evento não duplica", async () => {
    getOrder.mockResolvedValue(pedido({ contact_email: "m@x.com" }));
    await processPedido(evento);
    getOrder.mockResolvedValue(pedido({ contact_email: "m@x.com", updated_at: "2026-10-21T10:00:00+0000" }));
    await processPedido(evento);
    expect(contatosCriados).toHaveLength(1);
    expect(gravado()?.contact_id).toBe("novo-1");
  });

  it("corrida: índice único barra o insert, recasa com o contato que já existe", async () => {
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    const admin = fakeAdmin();
    let primeira = true;
    vi.mocked(createAdminClient).mockReturnValue({
      from: (t: string) => {
        const q = admin.from(t) as Record<string, unknown>;
        if (t === "contacts") {
          const busca = q.then as (ok: (r: unknown) => unknown) => unknown;
          q.then = (ok: (r: unknown) => unknown) => {
            if (primeira) return ok({ data: [], error: null });
            return busca(ok);
          };
          const insert = q.insert as (v: Linha) => unknown;
          q.insert = () => {
            primeira = false;
            contatos = [contato("c9", { phone_number: "+5511999998888" })];
            erroNoInsert = { code: "23505" };
            return insert({});
          };
        }
        return q;
      },
    } as never);
    expect(await processPedido(evento)).toMatchObject({ status: "ok" });
    expect(gravado()?.contact_id).toBe("c9");
  });

  it("erro do insert não perde o pedido: grava sem contato, detail só com o código", async () => {
    erroNoInsert = { code: "42501" };
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888", contact_email: "m@x.com" }));
    const r = await processPedido(evento);
    expect(r).toMatchObject({ status: "ok", detail: "contato_nao_criado:42501" });
    expect(JSON.stringify(r)).not.toMatch(/99999|m@x\.com/);
    expect(gravado()).toBeDefined();
    expect(gravado()).not.toHaveProperty("contact_id");
  });

  it("e-mail fora do CHECK (joao@gmail) é descartado; cria só com o telefone", async () => {
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888", contact_email: "joao@gmail" }));
    await processPedido(evento);
    expect(contatosCriados[0]).toMatchObject({ phone_number: "+5511999998888", email: null });
  });

  it("e-mail inválido e sem telefone: não cria", async () => {
    getOrder.mockResolvedValue(pedido({ contact_email: "joao@gmail" }));
    await processPedido(evento);
    expect(contatosCriados).toHaveLength(0);
  });

  it("nome sem controle/bidi e cortado por code point", async () => {
    getOrder.mockResolvedValue(
      pedido({ contact_phone: "+5511999998888", contact_name: `Ana\n‮Bo${"😀".repeat(300)}` }),
    );
    await processPedido(evento);
    const nome = contatosCriados[0]?.name as string;
    expect(nome).not.toMatch(/[\n‮]/);
    expect([...nome]).toHaveLength(200);
  });
});

describe("ao longo do tempo", () => {
  it("o pedido segue com o contato do 1º evento; outro contato com o mesmo número não troca", async () => {
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("novo-1");

    contatos = [contato("c2", { phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(pedido({ contact_phone: "+5511999998888", updated_at: "2026-10-22T10:00:00+0000" }));
    await processPedido(evento);
    expect(gravado()?.contact_id).toBe("novo-1");
  });
});

describe("LGPD", () => {
  it("o que é gravado não leva telefone, e-mail nem nome do comprador", async () => {
    contatos = [contato("c1", { phone_number: "+5511999998888" })];
    getOrder.mockResolvedValue(
      pedido({ contact_phone: "+5511999998888", contact_email: "m@x.com", contact_name: "Maria" }),
    );
    await processPedido(evento);
    const json = JSON.stringify(gravado());
    for (const p of ["99999", "m@x.com", "Maria"]) expect(json).not.toContain(p);
  });
});
