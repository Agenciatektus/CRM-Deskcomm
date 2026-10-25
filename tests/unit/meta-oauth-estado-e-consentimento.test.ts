/**
 * "Conectar com Meta": a parte pura: o `state` assinado, a URL de consentimento,
 * a leitura da resposta de token, a validade e a config por env.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeEnv = vi.hoisted(() => ({
  META_ADS_OAUTH_APP_ID: "",
  META_ADS_OAUTH_APP_SECRET: "",
  NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com.br/",
}));
vi.mock("@/lib/env", () => ({ env: fakeEnv }));

import {
  configuracaoDoMetaAds,
  enderecoDeRetorno,
  faltaParaConectarOMetaAds,
  metaAdsEstaConfigurado,
} from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { emitirEstado, verificarEstado } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import {
  ESCOPOS_DA_META,
  lerRespostaDeToken,
  montarUrlDeConsentimento,
} from "@/lib/plataformas-de-anuncio/meta/oauth/oauth";
import { diasParaVencer } from "@/lib/plataformas-de-anuncio/meta/oauth/validade";

const SEGREDO = "um-segredo-de-instalacao-bem-comprido";
const AGORA = new Date("2026-10-24T12:00:00Z");
const org = randomUUID();
const usuario = randomUUID();

describe("state do OAuth da Meta", () => {
  it("emite e valida, devolvendo organização, usuário e sessão", () => {
    const token = emitirEstado(
      { organizationId: org, userId: usuario, authSessionId: "sess1" },
      { segredo: SEGREDO, agora: AGORA },
    );
    const lido = verificarEstado(token, { segredo: SEGREDO, agora: AGORA });
    expect(lido).toMatchObject({ organizationId: org, userId: usuario, authSessionId: "sess1" });
    expect(lido?.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("recusa o expirado", () => {
    const token = emitirEstado(
      { organizationId: org, userId: usuario },
      { segredo: SEGREDO, agora: AGORA },
    );
    const depois = new Date(AGORA.getTime() + 10 * 60 * 1000 + 1);
    expect(verificarEstado(token, { segredo: SEGREDO, agora: depois })).toBeNull();
  });

  it("recusa carga adulterada e assinatura de outro segredo", () => {
    const token = emitirEstado(
      { organizationId: org, userId: usuario },
      { segredo: SEGREDO, agora: AGORA },
    );
    const [carga, assinatura] = token.split(".");
    const outra = Buffer.from(
      Buffer.from(carga!, "base64url").toString().replace(org, randomUUID()),
    ).toString("base64url");
    expect(
      verificarEstado(`${outra}.${assinatura}`, { segredo: SEGREDO, agora: AGORA }),
    ).toBeNull();
    expect(
      verificarEstado(token, { segredo: "outro-segredo-igualmente-comprido", agora: AGORA }),
    ).toBeNull();
  });

  it("recusa lixo e vazio sem lançar", () => {
    for (const lixo of [null, undefined, "", "abc", "a.b.c", "!!!.zz"]) {
      expect(verificarEstado(lixo, { segredo: SEGREDO, agora: AGORA })).toBeNull();
    }
  });

  it("não emite com segredo curto nem com ponto na carga", () => {
    expect(() =>
      emitirEstado({ organizationId: org, userId: usuario }, { segredo: "curto", agora: AGORA }),
    ).toThrow();
    expect(() =>
      emitirEstado({ organizationId: "a.b", userId: usuario }, { segredo: SEGREDO, agora: AGORA }),
    ).toThrow();
  });
});

describe("URL de consentimento", () => {
  it("leva os cinco escopos, o state, o retorno e o app", () => {
    const url = new URL(
      montarUrlDeConsentimento(
        { appId: "123", redirectUri: "https://crm.exemplo.com.br/cb" },
        { state: "ST" },
      ),
    );
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(url.searchParams.get("scope")).toBe(
      "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement",
    );
    expect(ESCOPOS_DA_META).toHaveLength(4);
    // Menor privilégio: a conexão só lê.
    expect(ESCOPOS_DA_META).not.toContain("ads_management");
    expect(url.searchParams.get("state")).toBe("ST");
    expect(url.searchParams.get("redirect_uri")).toBe("https://crm.exemplo.com.br/cb");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.search).not.toContain("secret");
  });

  it("lança sem app, sem retorno ou sem state", () => {
    expect(() =>
      montarUrlDeConsentimento({ appId: "", redirectUri: "x" }, { state: "s" }),
    ).toThrow();
    expect(() =>
      montarUrlDeConsentimento({ appId: "1", redirectUri: "" }, { state: "s" }),
    ).toThrow();
    expect(() =>
      montarUrlDeConsentimento({ appId: "1", redirectUri: "x" }, { state: " " }),
    ).toThrow();
  });
});

describe("resposta de token", () => {
  it("calcula a validade absoluta a partir de expires_in", () => {
    const r = lerRespostaDeToken(
      { access_token: "EAAtoken", expires_in: 5184000 },
      { agora: AGORA },
    );
    expect(r).toEqual({
      ok: true,
      token: {
        access_token: "EAAtoken",
        expira_em: new Date(AGORA.getTime() + 5184000 * 1000).toISOString(),
      },
    });
  });

  it("validade nula quando a Meta não informa", () => {
    const r = lerRespostaDeToken({ access_token: "EAAtoken" }, { agora: AGORA });
    expect(r).toMatchObject({ ok: true, token: { expira_em: null } });
  });

  it("erro da Graph não vaza a mensagem", () => {
    const r = lerRespostaDeToken(
      { error: { message: "Invalid code EAAsegredo123", type: "OAuthException", code: 100 } },
      { agora: AGORA, status: 400 },
    );
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("EAAsegredo123");
    expect(JSON.stringify(r)).toContain("100");
  });

  it("sem access_token e corpo não objeto", () => {
    expect(lerRespostaDeToken({}, { agora: AGORA })).toMatchObject({
      ok: false,
      motivo: "sem_access_token",
    });
    expect(lerRespostaDeToken("x", { agora: AGORA })).toMatchObject({
      ok: false,
      motivo: "resposta_invalida",
    });
  });
});

describe("validade do token", () => {
  it("conta dias, sinaliza vencido e ignora token colado à mão", () => {
    expect(diasParaVencer("2026-11-03T12:00:00Z", AGORA)).toBe(10);
    expect(diasParaVencer("2026-10-24T11:00:00Z", AGORA)).toBeLessThanOrEqual(0);
    expect(diasParaVencer(null, AGORA)).toBeNull();
    expect(diasParaVencer("lixo", AGORA)).toBeNull();
  });
});

describe("config por env", () => {
  beforeEach(() => {
    fakeEnv.META_ADS_OAUTH_APP_ID = "";
    fakeEnv.META_ADS_OAUTH_APP_SECRET = "";
  });

  it("sem as envs o conectar fica indisponível e a tela sabe o que falta", () => {
    expect(configuracaoDoMetaAds()).toBeNull();
    expect(metaAdsEstaConfigurado()).toBe(false);
    expect(faltaParaConectarOMetaAds()).toEqual([
      "META_ADS_OAUTH_APP_ID",
      "META_ADS_OAUTH_APP_SECRET",
    ]);
  });

  it("com só uma das duas continua indisponível", () => {
    fakeEnv.META_ADS_OAUTH_APP_ID = "123";
    expect(metaAdsEstaConfigurado()).toBe(false);
    expect(faltaParaConectarOMetaAds()).toEqual(["META_ADS_OAUTH_APP_SECRET"]);
  });

  it("com as duas monta o retorno sem barra dupla", () => {
    fakeEnv.META_ADS_OAUTH_APP_ID = "123";
    fakeEnv.META_ADS_OAUTH_APP_SECRET = "segredo";
    expect(configuracaoDoMetaAds()).toEqual({
      appId: "123",
      appSecret: "segredo",
      redirectUri: "https://crm.exemplo.com.br/api/v1/plataformas-de-anuncio/meta/callback",
    });
    expect(enderecoDeRetorno("http://localhost:3000")).toBe(
      "http://localhost:3000/api/v1/plataformas-de-anuncio/meta/callback",
    );
    expect(faltaParaConectarOMetaAds()).toEqual([]);
  });
});
