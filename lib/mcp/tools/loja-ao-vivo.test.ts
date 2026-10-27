import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// ── Dublês ──────────────────────────────────────────────────────────────────
const credenciais = vi.hoisted(() => vi.fn());
vi.mock("@/lib/nuvemshop/credenciais", () => ({ credenciaisDaLoja: credenciais }));

/** Redis de mentira: um Map, e um modo "fora do ar" em que toda ida rejeita. */
const { loja, fake } = vi.hoisted(() => {
const loja = { dados: new Map<string, unknown>(), fora: false };
const fake = {
  get: async (k: string) => (loja.fora ? Promise.reject(new Error("redis_off")) : (loja.dados.get(k) ?? null)),
  mget: async (...ks: string[]) =>
    loja.fora ? Promise.reject(new Error("redis_off")) : ks.map((k) => loja.dados.get(k) ?? null),
  set: async (k: string, v: unknown) => {
    if (loja.fora) throw new Error("redis_off");
    loja.dados.set(k, JSON.parse(JSON.stringify(v)));
    return "OK";
  },
  del: async (k: string) => {
    if (loja.fora) throw new Error("redis_off");
    loja.dados.delete(k);
    return 1;
  },
};
return { loja, fake };
});
vi.mock("@/lib/ai/rag/debounce", () => ({ getRedis: () => fake }));

import { crmCheckStoreStock, formatarProduto, type ProdutoLoja } from "./loja-ao-vivo";
import { invalidarProdutoDaLoja } from "@/lib/nuvemshop/cache-loja";
import type { McpContext } from "../types";

const ORG = "22222222-2222-4222-8222-222222222222";
const TOKEN = "segredo-do-token-123";

/** Qualquer uso do banco pelo handler reprova: ele só fala com a API da loja. */
const ctx = {
  organizationId: ORG,
  role: "agent",
  actor: { type: "ai_agent", id: "run-1", agent_id: "agent-1" },
  apiTokenId: "33333333-3333-4333-8333-333333333333",
  requestId: "44444444-4444-4444-8444-444444444444",
  supabase: new Proxy({}, { get: () => { throw new Error("banco_proibido"); } }),
} as unknown as McpContext;

const produtoCru = (over: Record<string, unknown> = {}) => ({
  id: 1001,
  name: { pt: "Vestido Floral" },
  canonical_url: "https://fiorotto.example/produtos/vestido-floral/",
  attributes: [{ pt: "Tamanho" }, { pt: "Cor" }],
  variants: [
    { sku: "V-P", values: [{ pt: "3 • P" }, { pt: "Azul" }], stock_management: true, stock: 4, price: "650.00", promotional_price: null },
    { sku: "V-M", values: [{ pt: "4 • M" }, { pt: "Azul" }], stock_management: true, stock: 0, price: "650.00", promotional_price: "520.00" },
    { sku: "V-G", values: [{ pt: "5 • G" }, { pt: "Azul" }], stock_management: false, stock: null, price: "690.00", promotional_price: null },
  ],
  ...over,
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const fetchMock = vi.fn();
const rodar = (termo = "vestido", limite?: number) =>
  crmCheckStoreStock.handler({ termo, limite: limite ?? 5 }, ctx) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  loja.dados.clear();
  loja.fora = false;
  credenciais.mockReset().mockResolvedValue({ accessToken: TOKEN, storeId: "9999" });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/** O contrato do produto de teste, por variante. Reusada no controle negativo. */
function conferir(p: ProdutoLoja) {
  const por = Object.fromEntries(p.variantes.map((v) => [v.sku, v]));
  expect(por["V-P"]).toMatchObject({ estoque: 4, disponivel: true, sem_controle: false });
  expect(por["V-M"]).toMatchObject({ estoque: 0, disponivel: false, sem_controle: false });
  expect(por["V-G"]).toMatchObject({ estoque: null, disponivel: true, sem_controle: true });
}

describe("crm_check_store_stock", () => {
  it("devolve saldo por variante, preço por variante, promoção, nome localizado e link", async () => {
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    const r = await rodar();

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe("https://api.tiendanube.com/v1/9999/products?q=vestido&per_page=5");
    expect(r.do_cache).toBe(false);
    expect(typeof r.consultado_em).toBe("string");
    const p = r.produtos[0] as ProdutoLoja;
    expect(p.nome).toBe("Vestido Floral");
    expect(p.link).toBe("https://fiorotto.example/produtos/vestido-floral/");
    conferir(p);
    const [pp, pm, pg] = p.variantes;
    expect(pp!.variacao).toBe("Tamanho: 3 • P, Cor: Azul");
    expect(pp!.preco_promocional).toBeNull();
    expect(pm!.preco_promocional).toMatch(/520,00/);
    expect(pg!.preco).toMatch(/690,00/); // preço próprio da variante, diferente das outras
    expect(pp!.preco).toMatch(/650,00/);
  });

  it("estoque 0 é indisponível e sem controle NUNCA vira zero", async () => {
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    const p = (await rodar()).produtos[0] as ProdutoLoja;
    expect(p.variantes[1]).toMatchObject({ estoque: 0, disponivel: false });
    expect(p.variantes[2]).toMatchObject({ estoque: null, sem_controle: true, disponivel: true });
  });

  it("CONTROLE NEGATIVO: o teste reprova se o saldo vier da variante errada", () => {
    const certo = formatarProduto(produtoCru(), "2026-10-27T00:00:00.000Z");
    conferir(certo); // o produto correto passa
    const vs = certo.variantes;
    const girado = { ...certo, variantes: vs.map((v, i) => ({ ...v, estoque: vs[(i + 1) % vs.length]!.estoque })) };
    expect(() => conferir(girado)).toThrow();
  });

  it("429: espera pelo x-rate-limit-reset e tenta de novo", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "slow down" }, 429, { "x-rate-limit-reset": "60" }))
      .mockResolvedValueOnce(json([produtoCru()]));
    const t0 = Date.now();
    const r = await rodar();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
    expect(r.produtos).toHaveLength(1);
  });

  it("429 que não passa: motivo declarado, sem token nem corpo no retorno", async () => {
    fetchMock.mockImplementation(async () => json({ message: `Bearer ${TOKEN}` }, 429, { "x-rate-limit-reset": "1" }));
    const r = await rodar();
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + no máximo 2 tentativas
    expect(r).toMatchObject({ produtos: [], motivo: "loja_nao_respondeu" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("loja desconectada", async () => {
    credenciais.mockResolvedValue(null);
    expect(await rodar()).toMatchObject({ produtos: [], motivo: "loja_nao_conectada" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(credenciais).toHaveBeenCalledWith(ORG);
  });

  it("busca vazia (404 da API) usa o vazio com motivo", async () => {
    fetchMock.mockImplementation(async () => json({ code: 404, description: "Last page is 0" }, 404));
    const r = await rodar("nada");
    expect(r).toMatchObject({ produtos: [], motivo: "nao_encontrado", do_cache: false });
    expect(crmCheckStoreStock.motivoDoVazio?.(r)).toBe("nao_encontrado");
  });

  it("o token não aparece no retorno de sucesso", async () => {
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    expect(JSON.stringify(await rodar())).not.toContain(TOKEN);
  });

  it("cache: a segunda busca não chama a API e diz do_cache=true", async () => {
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    const a = await rodar();
    const b = await rodar();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b.do_cache).toBe(true);
    expect(b.consultado_em).toBe(a.consultado_em);
    conferir(b.produtos[0]);
    expect([...loja.dados.keys()].every((k) => k.startsWith(`loja-ao-vivo:${ORG}:`))).toBe(true);
  });

  it("cache é por organização", async () => {
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    await rodar();
    const outra = { ...ctx, organizationId: "55555555-5555-4555-8555-555555555555" } as McpContext;
    await crmCheckStoreStock.handler({ termo: "vestido", limite: 5 }, outra);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidação (product/updated): apaga o produto e a busca volta à API", async () => {
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    await rodar();
    await invalidarProdutoDaLoja(ORG, "1001");
    fetchMock.mockImplementation(async () => json([produtoCru({ variants: [{ sku: "V-P", values: [], stock_management: true, stock: 1, price: "650.00" }] })]));
    const r = await rodar();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.do_cache).toBe(false);
    expect(r.produtos[0].variantes[0].estoque).toBe(1);
  });

  it("Redis fora do ar: segue sem cache, sem erro", async () => {
    loja.fora = true;
    fetchMock.mockImplementation(async () => json([produtoCru()]));
    const a = await rodar();
    const b = await rodar();
    expect(a.produtos).toHaveLength(1);
    expect(b.do_cache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(invalidarProdutoDaLoja(ORG, "1001")).resolves.toBeUndefined();
  });

  it("valida o input: termo com 2+ caracteres, limite 1..5", () => {
    const s = z.object(crmCheckStoreStock.inputSchema);
    expect(s.safeParse({ termo: "a" }).success).toBe(false);
    expect(s.safeParse({ termo: "ab", limite: 6 }).success).toBe(false);
    expect(s.parse({ termo: "ab" }).limite).toBe(5);
  });
});

describe("cerca de forma: a ferramenta não lê o RAG nem tabela local", () => {
  const ler = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  const ARQUIVOS = ["./loja-ao-vivo.ts", "../../nuvemshop/cache-loja.ts"];

  it("não importa RAG (exceto o formatador puro), catálogo local nem cliente de banco", () => {
    for (const f of ARQUIVOS) {
      const imports = [...ler(f).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
      for (const i of imports) {
        expect(i, `${f} importa ${i}`).not.toMatch(/rag\/(?!format-product|debounce)|catalogo\/|ai_chunks|supabase/);
      }
    }
  });

  it("não consulta tabela: nenhum .from(", () => {
    for (const f of ARQUIVOS) {
      const src = ler(f);
      expect(src).not.toMatch(/\.from\(/);
    }
  });
});
