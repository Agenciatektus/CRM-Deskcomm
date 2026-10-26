/**
 * O que o navegador aceita do popup da Meta, quando a opção existe, e que o canal gravado
 * pelo Embedded Signup sai pelo MESMO caminho da conexão por credenciais coladas.
 */
import { describe, expect, it, vi } from "vitest";

import { lerMensagemDaMeta } from "@/hooks/channels/useMetaEmbeddedSignup";
import { embeddedSignupConfigurado } from "@/lib/channels/meta/embedded-signup";

const OK = { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "999888777666555", phone_number_id: "111222333444555" } };

describe("lerMensagemDaMeta", () => {
  it("aceita as duas origens da Meta, em objeto ou em string JSON", () => {
    for (const origin of ["https://www.facebook.com", "https://web.facebook.com"]) {
      expect(lerMensagemDaMeta({ origin, data: OK })).toEqual({ wabaId: "999888777666555", phoneNumberId: "111222333444555" });
      expect(lerMensagemDaMeta({ origin, data: JSON.stringify(OK) })).not.toBeNull();
    }
  });

  it.each([
    "https://evil.example.com",
    "https://www.facebook.com.evil.example.com",
    "http://www.facebook.com",
    "https://facebook.com",
    "null",
  ])("ignora a origem %s mesmo com o formato certo", (origin) => {
    expect(lerMensagemDaMeta({ origin, data: OK })).toBeNull();
  });

  it("ignora formato inesperado", () => {
    const origin = "https://www.facebook.com";
    expect(lerMensagemDaMeta({ origin, data: { ...OK, type: "OUTRA_COISA" } })).toBeNull();
    expect(lerMensagemDaMeta({ origin, data: { type: "WA_EMBEDDED_SIGNUP", data: { waba_id: "abc", phone_number_id: "1" } } })).toBeNull();
    expect(lerMensagemDaMeta({ origin, data: { type: "WA_EMBEDDED_SIGNUP", data: { waba_id: 999888777666555, phone_number_id: 111222333444555 } } })).toBeNull();
    expect(lerMensagemDaMeta({ origin, data: "{quebrado" })).toBeNull();
    expect(lerMensagemDaMeta({ origin, data: null })).toBeNull();
  });
});

describe("embeddedSignupConfigurado", () => {
  it("sem META_APP_ID ou sem config_id não há opção", () => {
    expect(embeddedSignupConfigurado({})).toBeNull();
    expect(embeddedSignupConfigurado({ META_APP_ID: "1" })).toBeNull();
    expect(embeddedSignupConfigurado({ META_EMBEDDED_CONFIG_ID: "2" })).toBeNull();
    expect(embeddedSignupConfigurado({ META_APP_ID: "  ", META_EMBEDDED_CONFIG_ID: "2" })).toBeNull();
  });
  it("com os dois, devolve só o que é público; o config do Coexistence cai no geral", () => {
    const c = embeddedSignupConfigurado({ META_APP_ID: "1", META_EMBEDDED_CONFIG_ID: "2", META_APP_SECRET: "nao-sai" });
    expect(c).toEqual({ appId: "1", configId: "2", configIdCoexistencia: "2" });
    expect(JSON.stringify(c)).not.toContain("nao-sai");
  });
});

describe("o canal do Embedded Signup sai pelo caminho da conexão manual", () => {
  it("as duas rotas chamam gravarCanalOficial com os mesmos campos", async () => {
    vi.resetModules();
    const gravar = vi.fn(async () => ({ ok: true, displayName: "Loja", phoneNumber: "+5511900000001", webhook: null }));
    vi.doMock("@/lib/auth/require-role", () => ({
      requireRole: vi.fn(async () => ({ ok: true, user: { id: "u", idioma: "pt-BR", is_platform_admin: false }, org: { orgId: "org" } })),
    }));
    vi.doMock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
    vi.doMock("@/lib/channels/meta/app", () => ({ appDaMeta: vi.fn(async () => ({ appSecret: "s", verifyToken: "v" })), appDaMetaDoAmbiente: vi.fn() }));
    vi.doMock("@/lib/channels/meta/gravar-canal-oficial", () => ({ gravarCanalOficial: gravar }));
    vi.doMock("@/lib/channels/meta/validate-credentials", () => ({
      validateMetaCredentials: vi.fn(async () => ({ ok: true, displayPhoneNumber: "5511900000001", verifiedName: "Loja", qualityRating: null })),
    }));
    vi.doMock("@/lib/channels/meta/embedded-signup", () => ({
      embeddedSignupConfigurado: () => ({ appId: "1", configId: "2", configIdCoexistencia: "2" }),
      trocarCodePorToken: vi.fn(async () => ({ ok: true, token: "tok-de-negocio-bem-comprido" })),
      conferirTokenDeNegocio: vi.fn(async () => ({ ok: true })),
      registrarNumero: vi.fn(async () => ({ ok: true })),
    }));
    const { NextRequest } = await import("next/server");
    const manual = await import("@/app/api/v1/channels/official/route");
    const embedded = await import("@/app/api/v1/channels/official/embedded-signup/route");
    const mk = (corpo: unknown) =>
      new NextRequest("https://crm.exemplo.com/x", { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } });

    await manual.POST(mk({ phone_number_id: "111222333444555", waba_id: "999888777666555", token: "tok-de-negocio-bem-comprido" }));
    await embedded.POST(mk({ code: "c", phone_number_id: "111222333444555", waba_id: "999888777666555", coexistencia: false }));

    const [a, b] = gravar.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(Object.keys(a!).filter((k) => k !== "coexistencia").sort()).toEqual(Object.keys(b!).filter((k) => k !== "coexistencia").sort());
    expect(a!.coexistencia).toBeUndefined();
    expect(b!.coexistencia).toBe(false);
    for (const k of ["orgId", "phoneNumberId", "wabaId", "token", "displayPhoneNumber", "verifiedName"]) expect(a![k]).toEqual(b![k]);
    vi.doUnmock("@/lib/channels/meta/gravar-canal-oficial");
  });
});
