/**
 * COMPLETAR A ATRIBUIÇÃO COM O QUE A VERDASH SABE.
 *
 * A mensagem do anúncio traz o id do anúncio e o clique; o nome da campanha e do
 * conjunto vem do enriquecimento. Estes casos travam as regras de segurança do
 * merge (só preenche, nunca troca de anúncio) e o contrato da consulta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { completarComAVerdash, tentouHaPouco } from "@/lib/channels/verdash/atribuicao-enriquecida";
import { fzapAtribuicaoDireta, verdashAtribuicaoPareada } from "@/lib/channels/verdash/client";

const V = {
  ad_id: "120253837017130653",
  ad_name: "Peça A",
  adset_id: "S1",
  adset_name: "Conjunto 1",
  campaign_id: "C1",
  campaign_name: "Campanha Outubro",
  ctwa_clid: "AfX",
};

describe("completarComAVerdash", () => {
  it("preenche só o que falta no contato", () => {
    const r = completarComAVerdash({ ad_platform: "meta_ads", ad_id: "120253837017130653" }, V);
    expect(r).toEqual({
      ad_name: "Peça A",
      adset_id: "S1",
      adset_name: "Conjunto 1",
      campaign_id: "C1",
      campaign_name: "Campanha Outubro",
    });
  });

  it("nunca sobrescreve o que já está (correção feita à mão sobrevive)", () => {
    const r = completarComAVerdash(
      { ad_id: "120253837017130653", campaign_name: "Nome corrigido à mão" },
      V,
    );
    expect(r).not.toHaveProperty("campaign_name");
    expect(r).toHaveProperty("adset_name", "Conjunto 1");
  });

  it("anúncio diferente do primeiro toque não se mistura", () => {
    expect(completarComAVerdash({ ad_id: "999" }, V)).toBeNull();
  });

  it("lead da Verdash SEM ad_id não empresta nome a contato que tem ad_id", () => {
    expect(completarComAVerdash({ ad_id: "120253837017130653" }, { ...V, ad_id: null })).toBeNull();
  });

  it("contato sem ad_id herda o da Verdash", () => {
    expect(completarComAVerdash({ ad_platform: "meta_ads" }, V)).toHaveProperty("ad_id", V.ad_id);
  });

  it("nada a somar devolve null", () => {
    const completo = { ad_id: V.ad_id, ad_name: "a", adset_id: "b", adset_name: "c", campaign_id: "d", campaign_name: "e" };
    expect(completarComAVerdash(completo, V)).toBeNull();
  });

  it("ignora texto vazio e aparar excesso", () => {
    const r = completarComAVerdash({}, { ...V, ad_name: "   ", campaign_name: "x".repeat(900) });
    expect(r).not.toHaveProperty("ad_name");
    expect((r as Record<string, string>).campaign_name).toHaveLength(300);
  });
});

describe("verdashAtribuicaoPareada", () => {
  afterEach(() => vi.unstubAllGlobals());
  const creds = { instanceName: "i", token: "t".repeat(40), vinculoId: "v1", baseUrl: "http://x" };

  it("manda o x-crm-token e devolve por telefone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { resultados: [{ telefone: "+5566984135718", atribuicao: V }] } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await verdashAtribuicaoPareada(creds, ["+5566984135718"]);
    expect(r.get("+5566984135718")?.campaign_name).toBe("Campanha Outubro");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/crm-atribuicao-do-lead$/);
    expect((init.headers as Record<string, string>)["x-crm-token"]).toBe(creds.token);
  });

  it("recusa da Verdash vira erro com o vocabulário do canal, sem o corpo cru", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "nao_autorizado" }), { status: 401 })));
    await expect(verdashAtribuicaoPareada(creds, ["+55"])).rejects.toThrow(/verdash_request_failed: 401 nao_autorizado/);
  });
});

describe("fzapAtribuicaoDireta (canal direto: pergunta ao módulo de tráfego do FZAP)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const creds = { instanceName: "i", token: "t".repeat(40), vinculoId: null, baseUrl: "http://fzap" };
  const lead = (o: Record<string, unknown>) => ({
    senderPhone: "556699910216",
    adId: "AD1",
    adName: "Peça",
    adSetId: "S1",
    adSetName: "Conjunto",
    campaignId: "C1",
    campaignName: "Campanha",
    adCtwaClid: "CL",
    createdAt: "2026-10-20T10:00:00Z",
    ...o,
  });
  const responde = (items: unknown[]) =>
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { items } }), { status: 200 }),
    );

  it("busca pelos 8 últimos dígitos, com o token da instância, e devolve o lead do telefone", async () => {
    const f = responde([lead({})]);
    vi.stubGlobal("fetch", f);
    const r = await fzapAtribuicaoDireta(creds, "+5566999910216");
    expect(r).toMatchObject({ campaign_name: "Campanha", adset_name: "Conjunto", ad_name: "Peça", ad_id: "AD1" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/paid-traffic/leads?search=99910216");
    expect((init.headers as Record<string, string>).token).toBe(creds.token);
  });

  it("acha o lead gravado SEM o nono dígito (JID antigo)", async () => {
    vi.stubGlobal("fetch", responde([lead({ senderPhone: "556699910216" })]));
    expect(await fzapAtribuicaoDireta(creds, "+5566999910216")).not.toBeNull();
  });

  it("número parecido de OUTRA pessoa não entra (mesmo final, DDD diferente)", async () => {
    vi.stubGlobal("fetch", responde([lead({ senderPhone: "551199910216" })]));
    expect(await fzapAtribuicaoDireta(creds, "+5566999910216")).toBeNull();
  });

  it("escolhe o lead mais completo; sem sinal de anúncio devolve null", async () => {
    vi.stubGlobal(
      "fetch",
      responde([lead({ adId: null, campaignName: null, adSetName: null, adName: null, adCtwaClid: null }), lead({ campaignName: "Melhor" })]),
    );
    expect((await fzapAtribuicaoDireta(creds, "+5566999910216"))?.campaign_name).toBe("Melhor");
    vi.stubGlobal("fetch", responde([lead({ adId: null, campaignName: null, adSetName: null, adName: null, adCtwaClid: null })]));
    expect(await fzapAtribuicaoDireta(creds, "+5566999910216")).toBeNull();
  });

  it("telefone curto demais nem consulta; erro do FZAP vira exceção do canal", async () => {
    const f = responde([]);
    vi.stubGlobal("fetch", f);
    expect(await fzapAtribuicaoDireta(creds, "123")).toBeNull();
    expect(f).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error: "no_license" }), { status: 403 })));
    await expect(fzapAtribuicaoDireta(creds, "+5566999910216")).rejects.toThrow(/verdash_request_failed: 403/);
  });
});

describe("tentouHaPouco (não pergunta a cada abertura de conversa)", () => {
  const agora = Date.parse("2026-10-24T20:00:00Z");
  it("tentativa de 1 hora atrás vale; de 7 horas atrás já não", () => {
    expect(tentouHaPouco({ ad_enriquecimento_tentado_em: "2026-10-24T19:00:00Z" }, agora)).toBe(true);
    expect(tentouHaPouco({ ad_enriquecimento_tentado_em: "2026-10-24T13:00:00Z" }, agora)).toBe(false);
  });
  it("sem marca, marca inválida ou do futuro: pergunta", () => {
    expect(tentouHaPouco({}, agora)).toBe(false);
    expect(tentouHaPouco({ ad_enriquecimento_tentado_em: "lixo" }, agora)).toBe(false);
    expect(tentouHaPouco({ ad_enriquecimento_tentado_em: "2026-10-25T00:00:00Z" }, agora)).toBe(false);
  });
});
