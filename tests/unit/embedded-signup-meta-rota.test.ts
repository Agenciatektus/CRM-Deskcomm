/**
 * POST /api/v1/channels/official/embedded-signup — o servidor conclui o popup da Meta.
 *
 * Dublês no formato REAL da Graph (`{access_token, token_type, expires_in}`, `{id, ...}`,
 * `{error:{code,type,message}}`). Cada caso mede um desfecho, com controle negativo:
 * o que NÃO pode acontecer (gravar, registrar, vazar o token) é afirmado.
 */
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { gravarCanalOficial } from "@/lib/channels/meta/gravar-canal-oficial";
import { logger } from "@/lib/logger";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/channels/meta/app", () => ({ appDaMeta: vi.fn(async () => ({ appSecret: "SEGREDO-DO-APP-XYZ", verifyToken: "v" })) }));
vi.mock("@/lib/channels/meta/gravar-canal-oficial", () => ({ gravarCanalOficial: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { POST } from "@/app/api/v1/channels/official/embedded-signup/route";

const ORG = "org-da-sessao";
const WABA = "999888777666555";
const FONE = "111222333444555";
const TOKEN = "EAAG-TOKEN-DE-NEGOCIO-SECRETO";
const CODE = "AQD-CODE-DE-USO-UNICO";

const ESCOPOS_OK = {
  data: {
    is_valid: true,
    app_id: "123456789",
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    granular_scopes: [{ scope: "whatsapp_business_management", target_ids: [WABA] }],
  },
};

interface Chamada {
  url: string;
  method: string;
  corpo: string;
}
let chamadas: Chamada[];
type Rota = (url: string, init?: RequestInit) => unknown | undefined;
let sobrescreve: Rota | null;

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function graph(url: string, init?: RequestInit): Response {
  const alt = sobrescreve?.(url, init);
  if (alt !== undefined) return alt as Response;
  if (url.includes("/oauth/access_token")) return resposta({ access_token: TOKEN, token_type: "bearer", expires_in: 5183999 });
  if (url.includes("/debug_token")) return resposta(ESCOPOS_OK);
  if (url.includes(`/${WABA}/phone_numbers`)) return resposta({ data: [{ id: FONE }] });
  if (url.includes(`/${FONE}/register`)) return resposta({ success: true });
  if (url.includes(`/${FONE}?`)) {
    return resposta({ id: FONE, display_phone_number: "+55 11 90000-0001", verified_name: "Loja Exemplo", quality_rating: "GREEN" });
  }
  return resposta({ error: { code: 100, type: "OAuthException", message: "rota inesperada" } }, 400);
}

function req(corpo: unknown): NextRequest {
  return new NextRequest("https://crm.exemplo.com/api/v1/channels/official/embedded-signup", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}
const corpoValido = { code: CODE, waba_id: WABA, phone_number_id: FONE, coexistencia: false };

function logou(texto: string): boolean {
  const alvos = [
    ...Object.values(logger).flatMap((f) => (f as ReturnType<typeof vi.fn>).mock.calls),
    ...(console.log as ReturnType<typeof vi.fn>).mock.calls,
    ...(console.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(console.error as ReturnType<typeof vi.fn>).mock.calls,
  ];
  return JSON.stringify(alvos).includes(texto);
}

beforeEach(() => {
  vi.clearAllMocks();
  chamadas = [];
  sobrescreve = null;
  process.env.META_APP_ID = "123456789";
  process.env.META_EMBEDDED_CONFIG_ID = "555000111";
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "user-1", idioma: "pt-BR", is_platform_admin: false },
    org: { orgId: ORG },
  } as never);
  vi.mocked(gravarCanalOficial).mockResolvedValue({
    ok: true,
    displayName: "Loja Exemplo",
    phoneNumber: "+5511900000001",
    webhook: { registrado: true, url: "https://crm.exemplo.com/api/v1/webhooks/meta/t", erro: null, em: "2026-10-26T00:00:00Z" },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url: String(url), method: init?.method ?? "GET", corpo: String(init?.body ?? "") });
      return graph(String(url), init);
    }),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.META_APP_ID;
  delete process.env.META_EMBEDDED_CONFIG_ID;
});

describe("autorização", () => {
  it("sem admin/MFA a guarda responde e nada sai para a Meta", async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireRole).mockResolvedValueOnce({
        ok: false,
        response: NextResponse.json({ error: { code: "x" } }, { status }),
      } as never);
      const r = await POST(req(corpoValido));
      expect(r.status).toBe(status);
    }
    expect(chamadas).toHaveLength(0);
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });

  it("a organização é a da sessão: organization_id do corpo é ignorado", async () => {
    const r = await POST(req({ ...corpoValido, organization_id: "org-de-outro", orgId: "org-de-outro" }));
    expect(r.status).toBe(200);
    expect(vi.mocked(gravarCanalOficial).mock.calls[0]![0].orgId).toBe(ORG);
  });
});

describe("corpo", () => {
  it.each([
    ["code vazio", { ...corpoValido, code: "   " }],
    ["code ausente", { waba_id: WABA, phone_number_id: FONE, coexistencia: false }],
    ["waba com letras", { ...corpoValido, waba_id: "12ab45" }],
    ["phone com caracteres de URL", { ...corpoValido, phone_number_id: "123456/../me" }],
    ["coexistencia não booleana", { ...corpoValido, coexistencia: "true" }],
  ])("%s: 422 sem falar com a Meta", async (_nome, corpo) => {
    const r = await POST(req(corpo));
    expect(r.status).toBe(422);
    expect(chamadas).toHaveLength(0);
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });

  it("sem META_APP_ID ou config_id a conexão pela Meta não está disponível", async () => {
    delete process.env.META_EMBEDDED_CONFIG_ID;
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(422);
    expect(chamadas).toHaveLength(0);
  });
});

describe("fluxo com a Graph", () => {
  it("API Oficial: troca o code, confere escopo e número, REGISTRA com PIN de 6 dígitos e grava", async () => {
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(200);
    const ordem = chamadas.map((c) => c.url.split("?")[0]!.replace(/^.*\/v[\d.]+/, ""));
    expect(ordem).toEqual(["/oauth/access_token", "/debug_token", `/${FONE}`, `/${WABA}/phone_numbers`, `/${FONE}/register`]);
    const reg = chamadas.find((c) => c.url.includes("/register"))!;
    expect(reg.method).toBe("POST");
    expect(JSON.parse(reg.corpo)).toMatchObject({ messaging_product: "whatsapp", pin: expect.stringMatching(/^\d{6}$/) });
    const args = vi.mocked(gravarCanalOficial).mock.calls[0]![0];
    expect(args).toMatchObject({ phoneNumberId: FONE, wabaId: WABA, token: TOKEN, coexistencia: false, verifiedName: "Loja Exemplo" });
  });

  it("Coexistence NÃO chama /register e marca coexistencia na gravação", async () => {
    const r = await POST(req({ ...corpoValido, coexistencia: true }));
    expect(r.status).toBe(200);
    expect(chamadas.some((c) => c.url.includes("/register"))).toBe(false);
    expect(vi.mocked(gravarCanalOficial).mock.calls[0]![0].coexistencia).toBe(true);
  });

  it("code expirado ou já usado: erro específico, nada registrado nem gravado", async () => {
    sobrescreve = (url) =>
      url.includes("/oauth/access_token")
        ? resposta({ error: { code: 100, type: "OAuthException", message: "This authorization code has been used." } }, 400)
        : undefined;
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(422);
    expect(JSON.stringify(await r.json())).toContain("expirou ou já foi usado");
    expect(chamadas).toHaveLength(1);
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });

  it("token sem o escopo do WhatsApp: recusa antes de registrar", async () => {
    sobrescreve = (url) =>
      url.includes("/debug_token")
        ? resposta({ data: { is_valid: true, app_id: "123456789", scopes: ["public_profile"] } })
        : undefined;
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(422);
    expect(chamadas.some((c) => c.url.includes("/register"))).toBe(false);
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });

  it("token de OUTRO app é recusado", async () => {
    sobrescreve = (url) => (url.includes("/debug_token") ? resposta({ data: { ...ESCOPOS_OK.data, app_id: "999" } }) : undefined);
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(422);
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });

  it("número que não pertence à WABA: 422, sem registrar e sem gravar", async () => {
    sobrescreve = (url) => (url.includes(`/${WABA}/phone_numbers`) ? resposta({ data: [{ id: "555555555555555" }] }) : undefined);
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(422);
    expect(JSON.stringify(await r.json())).toContain("não pertence");
    expect(chamadas.some((c) => c.url.includes("/register"))).toBe(false);
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });

  it("número já em outra conta: erro específico e nada gravado", async () => {
    sobrescreve = (url) =>
      url.includes("/register")
        ? resposta({ error: { code: 131000, type: "OAuthException", message: "Phone number is already registered to another account" } }, 400)
        : undefined;
    const r = await POST(req(corpoValido));
    expect(r.status).toBe(422);
    expect(JSON.stringify(await r.json())).toContain("já está ligado a outra conta");
    expect(gravarCanalOficial).not.toHaveBeenCalled();
  });
});

describe("segredo", () => {
  it("token, code e App Secret não aparecem na resposta nem em log, no sucesso e nas falhas", async () => {
    const corpos: string[] = [];
    corpos.push(JSON.stringify(await (await POST(req(corpoValido))).json()));
    sobrescreve = (url) =>
      url.includes("/register")
        ? resposta({ error: { code: 100, type: "OAuthException", message: `falhou com ${TOKEN}` } }, 400)
        : undefined;
    corpos.push(JSON.stringify(await (await POST(req(corpoValido))).json()));
    sobrescreve = (url) => (url.includes("/oauth/access_token") ? resposta({ error: { code: 190, type: "OAuthException", message: CODE } }, 400) : undefined);
    corpos.push(JSON.stringify(await (await POST(req(corpoValido))).json()));
    vi.mocked(fetch).mockRejectedValueOnce(new Error(`ECONNRESET ${CODE} SEGREDO-DO-APP-XYZ`));
    corpos.push(JSON.stringify(await (await POST(req(corpoValido))).json()));
    const tudo = corpos.join("");
    for (const segredo of [TOKEN, CODE, "SEGREDO-DO-APP-XYZ"]) {
      expect(tudo).not.toContain(segredo);
      expect(logou(segredo)).toBe(false);
    }
  });
});
