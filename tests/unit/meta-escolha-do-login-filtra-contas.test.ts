import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({
  configuracaoDoMetaAds: () => ({ appId: "111", appSecret: "SEGREDO", redirectUri: "http://x/cb" }),
}));

import { listarContas, listarEmpresas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { lerIdentidadeDoToken } from "@/lib/plataformas-de-anuncio/meta/oauth/token";

/** Graph falsa no formato real; `debug` é a resposta do /debug_token (número = status de erro). */
function graph(debug: unknown) {
  const chamadas: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      chamadas.push(url);
      const j = (o: unknown) => new Response(JSON.stringify(o));
      if (url.includes("debug_token")) {
        return typeof debug === "number" ? new Response("{}", { status: debug }) : j(debug);
      }
      if (url.includes("me/businesses"))
        return j({ data: [{ id: "10", name: "BM10" }, { id: "11", name: "BM11" }] });
      if (url.includes("me/adaccounts")) return j({ data: [{ id: "act_9", account_id: "9" }] });
      if (url.includes("/10/owned_ad_accounts")) return j({ data: [{ id: "act_1", account_id: "1" }] });
      if (url.includes("/10/client_ad_accounts")) return j({ data: [{ id: "act_2", account_id: "2" }] });
      if (url.includes("/11/")) return j({ data: [{ id: "act_3", account_id: "3" }] });
      if (url.includes("/me?")) return j({ id: "1", name: "Fulano" });
      return j({ data: [] });
    }),
  );
  return chamadas;
}

const comGranular = (ids: string[]) => ({
  data: {
    is_valid: true,
    app_id: "111",
    granular_scopes: [{ scope: "business_management", target_ids: ids }, { scope: "ads_read" }],
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("a escolha do diálogo da Meta limita empresas e contas", () => {
  it("com granular: só a BM marcada, owned + client, sem me/adaccounts", async () => {
    const chamadas = graph(comGranular(["10"]));
    const r = await listarContas("t");
    expect(r.ok && r.dados.map((c) => c.id)).toEqual(["act_1", "act_2"]);
    expect(chamadas.some((u) => u.includes("me/adaccounts"))).toBe(false);
    expect(chamadas.some((u) => u.includes("/11/"))).toBe(false);
    // o segredo do app não vai para a URL
    expect(chamadas.every((u) => !u.includes("SEGREDO"))).toBe(true);
  });

  it("com granular: empresas e identidade só trazem as marcadas", async () => {
    graph(comGranular(["10"]));
    const e = await listarEmpresas("t");
    expect(e.ok && e.dados).toEqual([{ id: "10", nome: "BM10" }]);
    expect((await lerIdentidadeDoToken("t")).empresas).toEqual([{ id: "10", name: "BM10" }]);
  });

  it("sem granular de business_management: comportamento atual", async () => {
    graph({ data: { is_valid: true, app_id: "111", granular_scopes: [{ scope: "ads_read" }] } });
    const r = await listarContas("t");
    expect(r.ok && r.dados.map((c) => c.id)).toEqual(["act_9", "act_1", "act_3"]);
  });

  it("debug_token falhando: comportamento atual", async () => {
    graph(500);
    const r = await listarContas("t");
    expect(r.ok && r.dados.map((c) => c.id)).toEqual(["act_9", "act_1", "act_3"]);
    expect((await lerIdentidadeDoToken("t")).empresas).toHaveLength(2);
  });

  it("token de outro app: ignora a escolha", async () => {
    graph({ data: { ...comGranular(["10"]).data, app_id: "999" } });
    const r = await listarContas("t");
    expect(r.ok && r.dados).toHaveLength(3);
  });
});
