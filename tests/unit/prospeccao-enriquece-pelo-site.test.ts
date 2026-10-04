/**
 * O fallback do enriquecimento abre o site que veio do Maps. Este arquivo segura
 * as duas coisas que importam: achar o perfil certo, e NUNCA alcançar a rede
 * interna, nem por redirect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/automation/outbound-ip", () => ({
  assertDestinoResolvidoSeguro: vi.fn(async (host: string) => {
    if (host === "interno.exemplo" || host === "169.254.169.254") throw new Error("unsafe_url:private_ip");
  }),
}));

import {
  completarRedesPeloSite,
  lerPaginaPublica,
  redesDoHtml,
  redesQueFaltam,
  urlDoSite,
} from "@/lib/prospecting/enriquecer-pelo-site";
import type { Prospect } from "@/lib/prospecting/schema";

const HTML = `
  <a href="https://www.facebook.com/sharer.php?u=x">compartilhar</a>
  <a href="https://www.instagram.com/padariadobairro/">IG</a>
  <a href="https://facebook.com/padariadobairro">FB</a>
  <a href="https://br.linkedin.com/company/padaria-do-bairro">LI</a>`;

function prospect(over: Partial<Prospect> = {}): Prospect {
  return {
    key: "p1", name: "Padaria", phone: null, website: "padaria.exemplo", category: null,
    address: null, maps_url: null, rating: null, reviews: null, emails: [], socials: [], ...over,
  };
}

describe("o que o regex reconhece", () => {
  it("pega o perfil e pula o botão de compartilhar", () => {
    expect(redesDoHtml(HTML)).toEqual({
      instagram: "https://www.instagram.com/padariadobairro",
      facebook: "https://facebook.com/padariadobairro",
      linkedin: "https://br.linkedin.com/company/padaria-do-bairro",
    });
  });

  it("só procura a rede que o Apify não trouxe", () => {
    expect(redesQueFaltam(prospect({ socials: ["https://instagram.com/x"] }))).toEqual(["facebook", "linkedin"]);
  });

  it("site sem esquema vira HTTPS; lixo vira null", () => {
    expect(urlDoSite("padaria.exemplo")).toBe("https://padaria.exemplo/");
    expect(urlDoSite("http://padaria.exemplo/a")).toBe("https://padaria.exemplo/a");
    expect(urlDoSite("não é url")).toBeNull();
  });
});

describe("completar sem passar do teto nem estragar o que veio", () => {
  it("acrescenta só o que faltava, sem duplicar", async () => {
    const p = prospect({ socials: ["https://www.instagram.com/padariadobairro"] });
    const r = await completarRedesPeloSite([p], { ler: async () => HTML });
    expect(r).toEqual({ tentados: 1, completados: 1 });
    expect(p.socials).toHaveLength(3);
  });

  it("quem já tem as três redes, ou não tem site, nem é visitado", async () => {
    const ler = vi.fn(async () => HTML);
    await completarRedesPeloSite(
      [
        prospect({ website: null }),
        prospect({ socials: ["https://instagram.com/a", "https://facebook.com/abc", "https://linkedin.com/in/a"] }),
      ],
      { ler },
    );
    expect(ler).not.toHaveBeenCalled();
  });

  it("orçamento esgotado = para de abrir site, sem lançar", async () => {
    const ler = vi.fn(async () => HTML);
    const r = await completarRedesPeloSite([prospect(), prospect()], { ler, orcamentoMs: -1 });
    expect(r.tentados).toBe(0);
    expect(ler).not.toHaveBeenCalled();
  });
});

describe("SSRF: a rede interna nunca é alcançada", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("site que resolve para IP interno não recebe nem a primeira requisição", async () => {
    expect(await lerPaginaPublica("https://interno.exemplo/")).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirect de site público para o metadata da nuvem é recusado ANTES de seguir", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    );
    expect(await lerPaginaPublica("https://padaria.exemplo/")).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("redirect para hostname que resolve interno também é recusado", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://interno.exemplo/" } }),
    );
    expect(await lerPaginaPublica("https://padaria.exemplo/")).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("controle positivo: redirect público é seguido e o HTML volta", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/inicio" } }))
      .mockResolvedValueOnce(new Response(HTML, { status: 200, headers: { "content-type": "text/html" } }));
    expect(await lerPaginaPublica("https://padaria.exemplo/")).toContain("padariadobairro");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://padaria.exemplo/inicio");
  });

  it("corta o corpo no teto de bytes e ignora o que não é HTML", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("x".repeat(5000), { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect((await lerPaginaPublica("https://padaria.exemplo/", { timeoutMs: 1000, maxBytes: 100, maxSaltos: 3 })).length).toBe(100);
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(await lerPaginaPublica("https://padaria.exemplo/")).toBe("");
  });

  it("redirect em laço para no limite de saltos", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "/de-novo" } }));
    expect(await lerPaginaPublica("https://padaria.exemplo/")).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
