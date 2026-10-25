import { afterEach, describe, expect, it, vi } from "vitest";

import { listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";

/** Graph falsa: cada chave é um pedaço do caminho; o valor é a resposta (ou o status de erro). */
function graph(rotas: Record<string, unknown>) {
  const chamadas: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      chamadas.push(url);
      const chave = Object.keys(rotas).find((k) => url.includes(k));
      const r = chave ? rotas[chave] : undefined;
      if (typeof r === "number") {
        return new Response(JSON.stringify({ error: { message: "x", code: 1 } }), { status: r });
      }
      return new Response(JSON.stringify(r ?? { data: [] }), { status: 200 });
    }),
  );
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

describe("listarContas: união de me/adaccounts com as contas de cada BM", () => {
  it("une e deduplica por id", async () => {
    graph({
      "me/adaccounts": { data: [{ id: "act_1", account_id: "1", name: "A" }] },
      "me/businesses": { data: [{ id: "10", name: "BM" }, { id: "11", name: "BM2" }] },
      "10/owned_ad_accounts": {
        data: [{ id: "act_1", account_id: "1", name: "A" }, { id: "act_2", account_id: "2", name: "B" }],
      },
      "11/owned_ad_accounts": { data: [{ id: "act_3", account_id: "3", name: "C", currency: "USD" }] },
    });
    const r = await listarContas("t");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.map((c) => c.id)).toEqual(["act_1", "act_2", "act_3"]);
      expect(r.dados[2]).toMatchObject({ nome: "C", moeda: "USD" });
    }
  });

  it("BM com erro não derruba a lista", async () => {
    graph({
      "me/adaccounts": { data: [{ id: "act_1", account_id: "1" }] },
      "me/businesses": { data: [{ id: "10" }, { id: "11" }] },
      "10/owned_ad_accounts": 500,
      "11/owned_ad_accounts": { data: [{ id: "act_3", account_id: "3" }] },
    });
    const r = await listarContas("t");
    expect(r.ok && r.dados.map((c) => c.id)).toEqual(["act_1", "act_3"]);
  });

  it("me/businesses com erro: segue só com me/adaccounts", async () => {
    graph({ "me/adaccounts": { data: [{ id: "act_1", account_id: "1" }] }, "me/businesses": 500 });
    const r = await listarContas("t");
    expect(r.ok && r.dados).toHaveLength(1);
  });

  it("erro em me/adaccounts continua sendo o erro da leitura", async () => {
    graph({ "me/adaccounts": 500 });
    const r = await listarContas("t");
    expect(r.ok).toBe(false);
  });

  it("segue a paginação das BMs e recusa id de BM que não é numérico", async () => {
    const chamadas = graph({
      "me/adaccounts": { data: [] },
      "me/businesses": { data: [{ id: "10" }, { id: "../x" }] },
      "10/owned_ad_accounts": {
        data: [{ id: "act_2", account_id: "2" }],
        paging: { next: "https://graph.facebook.com/v25.0/10/owned_ad_accounts?after=Z" },
      },
    });
    const r = await listarContas("t");
    expect(r.ok && r.dados.map((c) => c.id)).toContain("act_2");
    expect(chamadas.some((u) => u.includes("after=Z"))).toBe(true);
    expect(chamadas.some((u) => u.includes("x/owned"))).toBe(false);
  });
});
