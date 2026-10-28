import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarFunilPadrao, funisCompativeis, gravarEscolha, SLUGS } from "@/lib/nuvemshop/funil-de-pedidos";
import { sincronizarCardDoPedido } from "@/lib/nuvemshop/pedido-card";
import { createLeadHandler } from "@/app/api/v1/leads/_handler";

vi.mock("@/app/api/v1/leads/_handler", () => ({ createLeadHandler: vi.fn(), moveLeadHandler: vi.fn() }));

type Linha = Record<string, unknown>;
let t: Record<string, Linha[]> & { crm_pipelines: Linha[]; crm_stages: Linha[]; tenant_integrations: Linha[] };
let falhaEtapas = false;
let n = 0;

function fakeAdmin() {
  return {
    from: (tabela: string) => {
      const f: Array<(l: Linha) => boolean> = [];
      let modo: "select" | "insert" | "update" | "delete" = "select";
      let valor: Linha | Linha[] = {};
      const rows = () => (t[tabela] ??= []);
      const lista = () => rows().filter((l) => f.every((p) => p(l)));
      const executa = () => {
        if (modo === "insert") {
          // O PostgREST recusa objeto em coluna text[] (crm_pipelines.fontes): o dublê também.
          if (tabela === "crm_pipelines" && !Array.isArray((valor as Linha).fontes)) return { data: null, error: { code: "22P02" } };
          if (tabela === "crm_stages" && falhaEtapas) return { data: null, error: { code: "x" } };
          const novos = ([] as Linha[]).concat(valor).map((v) => ({ id: `id${++n}`, is_archived: false, ...v }));
          rows().push(...novos);
          return { data: novos, error: null };
        }
        if (modo === "update") return lista().forEach((l) => Object.assign(l, valor)), { error: null };
        if (modo === "delete") return (t[tabela] = rows().filter((l) => !lista().includes(l))), { error: null };
        return { data: lista(), error: null };
      };
      const q = {
        select: () => q,
        insert: (v: Linha | Linha[]) => ((modo = "insert"), (valor = v), q),
        update: (v: Linha) => ((modo = "update"), (valor = v), q),
        delete: () => ((modo = "delete"), q),
        limit: () => q,
        order: () => q,
        eq: (k: string, v: unknown) => (f.push((l) => l[k] === v), q),
        in: (k: string, v: unknown[]) => (f.push((l) => v.includes(l[k])), q),
        maybeSingle: async () => ({ data: lista()[0] ?? null, error: null }),
        single: async () => {
          const r = executa() as { data: Linha[] | null; error: unknown };
          return { data: r.data?.[0] ?? null, error: r.error };
        },
        then: (ok: (r: unknown) => unknown) => ok(executa()),
      };
      return q;
    },
  } as never;
}

const monta = (org: string, id: string, name: string, slugs = SLUGS) => {
  t.crm_pipelines.push({ id, organization_id: org, name, slug: id, position: 1000, is_archived: false });
  slugs.forEach((slug, i) =>
    t.crm_stages.push({ id: `${id}-${slug}`, organization_id: org, pipeline_id: id, slug, position: (i + 1) * 1000, is_archived: false, is_won: slug === "entregue", is_lost: slug.startsWith("cancelado") }),
  );
};
const integ = (meta: Linha) => t.tenant_integrations.push({ id: "i1", organization_id: "o1", provider: "nuvemshop", store_metadata: meta });
const pedido = { externalId: "9", numero: "9", status: "pending" as const, statusAnterior: null, totalCents: 100, rastreio: null, contactId: "c1" };

beforeEach(() => {
  t = { crm_pipelines: [], crm_stages: [], tenant_integrations: [] };
  falhaEtapas = false;
  vi.mocked(createLeadHandler).mockReset().mockResolvedValue({ id: "l1" } as never);
});

describe("funil dos pedidos escolhido", () => {
  it("usa o funil escolhido em vez do nome", async () => {
    monta("o1", "padrao", "Pedidos do Site");
    monta("o1", "meu", "Loja");
    integ({ store_id: "1", pedidos_pipeline_id: "meu" });
    await sincronizarCardDoPedido(fakeAdmin(), "o1", pedido);
    expect(vi.mocked(createLeadHandler).mock.calls[0]![2]).toMatchObject({ pipeline_id: "meu" });
  });

  it("sem escolha cai no nome; escolha que sumiu também", async () => {
    monta("o1", "padrao", "Pedidos do Site");
    await sincronizarCardDoPedido(fakeAdmin(), "o1", pedido);
    integ({ pedidos_pipeline_id: "apagado" });
    await sincronizarCardDoPedido(fakeAdmin(), "o1", pedido);
    expect(vi.mocked(createLeadHandler).mock.calls.map((c) => (c[2] as Linha).pipeline_id)).toEqual(["padrao", "padrao"]);
  });

  it("sem funil nenhum continua funil_ausente", async () => {
    expect(await sincronizarCardDoPedido(fakeAdmin(), "o1", pedido)).toEqual({ status: "skipped", detail: "funil_ausente" });
  });

  it("rejeita funil de outra org e funil incompatível", async () => {
    monta("o2", "alheio", "X");
    monta("o1", "curto", "Curto", SLUGS.slice(0, 5));
    integ({ store_id: "1" });
    expect(await gravarEscolha(fakeAdmin(), "o1", "alheio")).toBe(false);
    expect(await gravarEscolha(fakeAdmin(), "o1", "curto")).toBe(false);
    expect(await funisCompativeis(fakeAdmin(), "o1")).toEqual([]);
  });

  it("gravarEscolha faz merge e preserva store_id", async () => {
    monta("o1", "meu", "Loja");
    integ({ store_id: "1" });
    expect(await gravarEscolha(fakeAdmin(), "o1", "meu")).toBe(true);
    expect(t.tenant_integrations[0]!.store_metadata).toEqual({ store_id: "1", pedidos_pipeline_id: "meu" });
  });

  it("criarFunilPadrao cria o funil com 6 etapas e sufixa o slug", async () => {
    monta("o1", "pedidos-do-site", "Pedidos do Site");
    const id = await criarFunilPadrao(fakeAdmin(), "o1");
    expect(t.crm_pipelines.find((p) => p.id === id)).toMatchObject({ slug: "pedidos-do-site-2", is_default: false });
    const et = t.crm_stages.filter((e) => e.pipeline_id === id);
    expect(et.map((e) => e.slug)).toEqual(SLUGS);
    expect(et.find((e) => e.slug === "entregue")).toMatchObject({ is_won: true, envia_conversao: false, evento_de_conversao: "Purchase" });
    expect((await funisCompativeis(fakeAdmin(), "o1")).some((f) => f.id === id)).toBe(true);
  });

  it("desfaz o funil se as etapas falham", async () => {
    falhaEtapas = true;
    await expect(criarFunilPadrao(fakeAdmin(), "o1")).rejects.toThrow();
    expect(t.crm_pipelines).toEqual([]);
  });
});
