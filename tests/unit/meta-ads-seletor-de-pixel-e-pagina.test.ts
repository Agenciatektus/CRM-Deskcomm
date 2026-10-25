import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listarPaginas, listarPixels } from "@/lib/plataformas-de-anuncio/meta/insights";

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe("listarPixels", () => {
  it("devolve id e nome, com o token no header e fora da URL", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: "111", name: "Pixel A" }, { name: "sem id" }] }));
    const r = await listarPixels("TOKEN-SECRETO", "act_123");
    expect(r).toEqual({ ok: true, dados: [{ id: "111", nome: "Pixel A" }] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/act_123/adspixels");
    expect(String(url)).toContain("fields=id%2Cname");
    expect(String(url)).not.toContain("TOKEN-SECRETO");
    expect(init.headers.authorization).toBe("Bearer TOKEN-SECRETO");
  });

  it("recusa conta fora de act_<digitos> sem chamar a rede", async () => {
    for (const ruim of ["123", "act_", "act_1/../me", "act_12x"]) {
      const r = await listarPixels("t", ruim);
      expect(r.ok).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro da Graph vira falha classificada, sem copiar o corpo", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 190, message: "Invalid OAuth access token TOKEN-SECRETO" } }, 400),
    );
    const r = await listarPixels("TOKEN-SECRETO", "act_123");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.falha).toBe("token_invalido");
      expect(JSON.stringify(r)).not.toContain("TOKEN-SECRETO");
    }
  });
});

describe("listarPaginas", () => {
  it("lista as Páginas de me/accounts", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: "9", name: "Loja" }] }));
    const r = await listarPaginas("t");
    expect(r).toEqual({ ok: true, dados: [{ id: "9", nome: "Loja" }] });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/me/accounts");
  });

  it("falha de permissão não vaza o corpo", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 200, message: "segredo da Graph" } }, 403));
    const r = await listarPaginas("t");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.falha).toBe("permissao_insuficiente");
      expect(r.detalhe).not.toContain("segredo");
    }
  });
});
