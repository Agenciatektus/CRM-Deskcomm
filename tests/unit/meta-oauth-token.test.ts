/**
 * "Conectar com Meta": a rede. fetch mockado: código -> token curto -> token
 * longo, erro 400 da Graph sem vazar o corpo, e nada de segredo na URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  lerPerfilDoToken,
  obterTokenLongo,
  trocarCodigoPorToken,
} from "@/lib/plataformas-de-anuncio/meta/oauth/token";

const APP = {
  appId: "111",
  appSecret: "SEGREDO-DO-APP",
  redirectUri: "https://crm.exemplo.com.br/cb",
};
const AGORA = new Date("2026-10-24T12:00:00Z");

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("troca de token da Meta", () => {
  it("código vira token curto e depois longo, com segredo só no corpo", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "CURTO", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ access_token: "LONGO", expires_in: 5184000 }));

    const r = await obterTokenLongo(APP, "CODIGO", { agora: AGORA });

    expect(r).toEqual({
      ok: true,
      token: {
        access_token: "LONGO",
        expira_em: new Date(AGORA.getTime() + 5184000_000).toISOString(),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url1, init1] = fetchMock.mock.calls[0]!;
    const [url2, init2] = fetchMock.mock.calls[1]!;
    expect(String(url1)).toMatch(
      /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/oauth\/access_token$/,
    );
    expect(String(url2)).toBe(String(url1));
    expect(init1.method).toBe("POST");
    expect(init1.body).toContain("code=CODIGO");
    expect(init1.body).toContain("client_secret=SEGREDO-DO-APP");
    expect(init2.body).toContain("grant_type=fb_exchange_token");
    expect(init2.body).toContain("fb_exchange_token=CURTO");
    expect(String(url1) + String(url2)).not.toMatch(/SEGREDO|CODIGO|CURTO/);
  });

  it("erro 400 da Graph não lança, não vaza o corpo e não chega à segunda troca", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: {
            message: "Code CODIGO-SECRETO expired SEGREDO-DO-APP",
            type: "OAuthException",
            code: 100,
          },
        },
        400,
      ),
    );
    const r = await obterTokenLongo(APP, "CODIGO", { agora: AGORA });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/CODIGO-SECRETO|SEGREDO-DO-APP/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falha de rede, timeout e corpo ilegível viram resultado, nunca exceção", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await trocarCodigoPorToken(APP, "c", { agora: AGORA })).toMatchObject({ ok: false });

    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }));
    expect(await trocarCodigoPorToken(APP, "c", { agora: AGORA })).toMatchObject({
      ok: false,
      motivo: "resposta_invalida",
    });
  });

  it("falha na segunda troca devolve o erro e não o token curto", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "CURTO", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ error: { type: "OAuthException", code: 190 } }, 400));
    const r = await obterTokenLongo(APP, "c", { agora: AGORA });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("CURTO");
  });
});

describe("perfil do token", () => {
  it("lê id e permissões concedidas, com o token no cabeçalho", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "999" })).mockResolvedValueOnce(
      json({
        data: [
          { permission: "ads_read", status: "granted" },
          { permission: "ads_management", status: "declined" },
        ],
      }),
    );
    const r = await lerPerfilDoToken("TOKEN");
    expect(r).toEqual({ metaUserId: "999", scopes: ["ads_read"] });
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("TOKEN");
      expect(init.headers.authorization).toBe("Bearer TOKEN");
    }
  });

  it("falha na leitura vira nulo, NUNCA a lista pedida como se fosse a concedida", async () => {
    fetchMock.mockRejectedValue(new Error("rede"));
    expect(await lerPerfilDoToken("T")).toEqual({
      metaUserId: null,
      scopes: null,
    });
  });
});
