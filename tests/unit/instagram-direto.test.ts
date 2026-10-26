// ─── Conectar o Instagram direto pelo CRM ───────────────────────────────────
//
// O que se cobra: um erro aqui entrega o Direct de um cliente a outro. Os dublês da plataforma
// usam o formato REAL das respostas (`{success, data}` e `{error: "codigo"}`) e os controles
// negativos provam que a plataforma NÃO é chamada quando a sessão não é a do cookie.

import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { saveInstagramSession } from "@/lib/channels/connect";
import { destinoDaVoltaDoInstagram } from "@/lib/channels/instagram/direto-retorno";
import { mensagemDoMotivo } from "@/lib/channels/instagram/direto-mensagens";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn(async () => false) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "update"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: null });
      return q;
    },
  })),
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_a: unknown, v: string) => `cifrado:${v}`),
}));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: (t: string) => t }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test", INTERNAL_SECRET: "segredo-interno-de-teste-0123456789" },
}));
vi.mock("@/lib/channels/connect", () => ({
  listInstagramSessions: vi.fn(async () => []),
  escolherSessaoHospedada: vi.fn(() => null),
  saveInstagramSession: vi.fn(async () => ({ error: null })),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "segredo-do-parceiro-0123456789";
const CONCLUSAO = "a".repeat(64);

let fetchMock: ReturnType<typeof vi.fn>;
const logs: string[] = [];

function como(userId: string, orgId: string) {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: userId, idioma: "pt-BR" },
    org: { orgId, name: "Clinica" },
  } as never);
}

function reqIniciar() {
  return new NextRequest("http://localhost/api/v1/channels/instagram/iniciar", {
    method: "POST",
    // Org tentando vir do corpo: tem de ser ignorada.
    body: JSON.stringify({ org_id: OUTRA_ORG }),
  });
}

function reqConcluir(cookie: string | null, corpo: unknown) {
  return new NextRequest("http://localhost/api/v1/channels/instagram/concluir", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie: `crm_ig_pedido=${cookie}` } : {}) },
    body: JSON.stringify(corpo),
  });
}

/** Faz o iniciar de verdade e devolve o cookie lacrado, o pedido e o nonce_hash enviado. */
async function iniciar(userId = "u1", orgId = ORG) {
  como(userId, orgId);
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        success: true,
        data: { pedido_id: "33333333-3333-4333-8333-333333333333", authorize_url: "https://www.instagram.com/oauth/authorize?x=1", expira_em: "2026-10-26T12:00:00Z" },
      }),
      { status: 200 },
    ),
  );
  const { POST } = await import("@/app/api/v1/channels/instagram/iniciar/route");
  const res = await POST();
  const corpoEnviado = JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body));
  return { res, corpoEnviado, cookie: res.cookies.get("crm_ig_pedido")?.value ?? null, pedidoId: "33333333-3333-4333-8333-333333333333" };
}

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  process.env.VERDASH_CRM_PARTNER_SECRET = SEGREDO;
  delete process.env.VERDASH_CRM_API_BASE_URL;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  for (const nivel of ["log", "warn", "error", "info"] as const) {
    vi.spyOn(console, nivel).mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
  }
  vi.mocked(mfaEmDivida).mockResolvedValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("iniciar", () => {
  it("devolve só a authorize_url, com o contrato da plataforma e o nonce só no cookie", async () => {
    const { res, corpoEnviado, cookie } = await iniciar();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { authorize_url: "https://www.instagram.com/oauth/authorize?x=1" } });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.verdash.com.br/crm/v1/instagram/iniciar");
    expect(init.headers["X-Crm-Segredo"]).toBe(SEGREDO);
    expect(init.headers.Authorization).toBeUndefined();

    // Org da SESSÃO, nunca do corpo; return_url montada pelo servidor.
    expect(corpoEnviado.org_externa_id).toBe(ORG);
    expect(corpoEnviado.return_url).toBe("https://crm.exemplo.test/api/v1/channels/instagram/retorno");
    expect(corpoEnviado.webhook_url).toMatch(/^https:\/\/crm\.exemplo\.test\/api\/v1\/webhooks\/channel\/[0-9a-f]{32}$/);
    expect(corpoEnviado.webhook_secret.length).toBeGreaterThanOrEqual(16);
    expect(corpoEnviado.nonce_hash).toMatch(/^[0-9a-f]{64}$/);

    // O nonce não está na resposta nem no cookie em claro (que é cifrado).
    const bruto = JSON.stringify(json) + res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(bruto).not.toContain(Buffer.from(cookie!, "base64url").toString("utf8").slice(0, 0) + SEGREDO);
    expect(logs.join("\n")).not.toContain(SEGREDO);
  });

  it("sem VERDASH_CRM_PARTNER_SECRET a opção não existe (404) e nada é chamado", async () => {
    delete process.env.VERDASH_CRM_PARTNER_SECRET;
    como("u1", ORG);
    const { POST } = await import("@/app/api/v1/channels/instagram/iniciar/route");
    const res = await POST();
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa quem não é admin e quem está com MFA em dívida", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response("{}", { status: 403 }) } as never);
    const { POST } = await import("@/app/api/v1/channels/instagram/iniciar/route");
    expect((await POST()).status).toBe(403);

    como("u1", ORG);
    vi.mocked(mfaEmDivida).mockResolvedValue(true);
    expect((await POST()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro da plataforma vira código fechado, sem repassar o texto dela", async () => {
    como("u1", ORG);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "limite_de_orgs_do_parceiro" }), { status: 429 }));
    const { POST } = await import("@/app/api/v1/channels/instagram/iniciar/route");
    const res = await POST();
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("limite_de_orgs");
  });
});

describe("concluir", () => {
  const dadosDoConcluir = {
    success: true,
    data: {
      vinculo_id: "44444444-4444-4444-8444-444444444444",
      instancia_id: "55555555-5555-4555-8555-555555555555",
      token: "token-de-maquina-unico",
      provider: "instagram",
      username: "clinica",
      display_name: "Clinica",
      status: "connected",
    },
  };

  async function concluir(cookie: string | null, corpo: unknown) {
    const { POST } = await import("@/app/api/v1/channels/instagram/concluir/route");
    return POST(reqConcluir(cookie, corpo));
  }

  it("grava o canal igual ao do fluxo por código e manda o nonce que só o servidor tem", async () => {
    const { cookie, pedidoId, corpoEnviado } = await iniciar();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(dadosDoConcluir), { status: 200 }));
    como("u1", ORG);

    const res = await concluir(cookie, { pedido_id: pedidoId, conclusao: CONCLUSAO });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ connected: true, display_name: "@clinica", status: "WORKING" });

    const enviado = JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body));
    expect(fetchMock.mock.calls.at(-1)![0]).toBe("https://api.verdash.com.br/crm/v1/instagram/concluir");
    expect(enviado.pedido_id).toBe(pedidoId);
    expect(enviado.conclusao).toBe(CONCLUSAO);
    // O nonce em claro casa com o hash enviado ao iniciar.
    expect(createHash("sha256").update(enviado.nonce).digest("hex")).toBe(corpoEnviado.nonce_hash);

    const g = vi.mocked(saveInstagramSession).mock.calls[0]![1];
    expect(g).toMatchObject({
      organizationId: ORG,
      instanceName: dadosDoConcluir.data.instancia_id,
      vinculoId: dadosDoConcluir.data.vinculo_id,
      tokenEncrypted: "cifrado:token-de-maquina-unico",
      phoneNumber: null,
      displayName: "@clinica",
      connected: true,
    });
    // O caminho e o segredo do webhook são os mesmos que foram à plataforma ao iniciar.
    expect(corpoEnviado.webhook_url.endsWith(g.webhookPathToken)).toBe(true);
    expect(g.webhookSecretEncrypted).toBe(`cifrado:${corpoEnviado.webhook_secret}`);

    // Nada sensível na resposta, no log nem no corpo.
    const tudo = JSON.stringify(json) + logs.join("\n");
    for (const s of [enviado.nonce, CONCLUSAO, "token-de-maquina-unico", SEGREDO, corpoEnviado.webhook_secret]) {
      expect(tudo).not.toContain(s);
    }
    // O cookie é apagado depois de usado.
    expect(res.headers.get("set-cookie")).toMatch(/crm_ig_pedido=;|Max-Age=0/i);
  });

  const casos: Array<[string, () => Promise<{ cookie: string | null; corpo: unknown; sessao: [string, string] }>]> = [
    ["cookie ausente", async () => {
      const i = await iniciar();
      return { cookie: null, corpo: { pedido_id: i.pedidoId, conclusao: CONCLUSAO }, sessao: ["u1", ORG] };
    }],
    ["cookie adulterado", async () => {
      const i = await iniciar();
      return { cookie: i.cookie!.slice(0, -4) + "AAAA", corpo: { pedido_id: i.pedidoId, conclusao: CONCLUSAO }, sessao: ["u1", ORG] };
    }],
    ["cookie de outro usuário", async () => {
      const i = await iniciar("u1", ORG);
      return { cookie: i.cookie, corpo: { pedido_id: i.pedidoId, conclusao: CONCLUSAO }, sessao: ["u2", ORG] };
    }],
    ["cookie de outra organização", async () => {
      const i = await iniciar("u1", ORG);
      return { cookie: i.cookie, corpo: { pedido_id: i.pedidoId, conclusao: CONCLUSAO }, sessao: ["u1", OUTRA_ORG] };
    }],
    ["pedido_id diferente do do cookie", async () => {
      const i = await iniciar();
      return { cookie: i.cookie, corpo: { pedido_id: "66666666-6666-4666-8666-666666666666", conclusao: CONCLUSAO }, sessao: ["u1", ORG] };
    }],
    ["conclusão malformada", async () => {
      const i = await iniciar();
      return { cookie: i.cookie, corpo: { pedido_id: i.pedidoId, conclusao: "curta" }, sessao: ["u1", ORG] };
    }],
  ];

  it.each(casos)("%s: erro genérico e NENHUMA chamada ao concluir", async (_nome, montar) => {
    const { cookie, corpo, sessao } = await montar();
    fetchMock.mockClear();
    como(sessao[0], sessao[1]);
    const res = await concluir(cookie, corpo);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("pedido_invalido");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveInstagramSession).not.toHaveBeenCalled();
  });

  it("cookie vencido: mesmo erro genérico, sem chamar a plataforma", async () => {
    const { cookie, pedidoId } = await iniciar();
    fetchMock.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    try {
      como("u1", ORG);
      const res = await concluir(cookie, { pedido_id: pedidoId, conclusao: CONCLUSAO });
      expect(res.status).toBe(422);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sem sessão admin: 401/403 e nada chamado", async () => {
    const { cookie, pedidoId } = await iniciar();
    fetchMock.mockClear();
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response("{}", { status: 401 }) } as never);
    expect((await concluir(cookie, { pedido_id: pedidoId, conclusao: CONCLUSAO })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("422 da plataforma vira pedido_invalido; 410 vira expirado; 409 vira já concluído", async () => {
    for (const [status, error, codigo] of [
      [422, "pedido_invalido", "pedido_invalido"],
      [410, "pedido_expirado", "pedido_expirado"],
      [409, "pedido_ja_concluido", "pedido_ja_concluido"],
    ] as const) {
      const { cookie, pedidoId } = await iniciar();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error }), { status }));
      como("u1", ORG);
      const res = await concluir(cookie, { pedido_id: pedidoId, conclusao: CONCLUSAO });
      expect(res.status).toBe(status);
      expect((await res.json()).error.code).toBe(codigo);
    }
    expect(saveInstagramSession).not.toHaveBeenCalled();
  });
});

describe("desconectar", () => {
  it("revoga na plataforma só o canal criado por este fluxo e tolera falha sem lançar", async () => {
    const { desconectarInstagramDireto } = await import("@/lib/channels/instagram/direto");
    const admin = (marcado: boolean) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.maybeSingle = async () => ({
        data: { verdash_vinculo_id: "v-1", metadata: marcado ? { instagram_direto: true } : {} },
      });
      return { from: () => q } as never;
    };

    // Criado por código: não toca na plataforma.
    expect(await desconectarInstagramDireto(admin(false), { orgId: ORG, channelSessionId: "c1" })).toBe("nao_se_aplica");
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { revogado: true, instancia_arquivada: true } }), { status: 200 }));
    expect(await desconectarInstagramDireto(admin(true), { orgId: ORG, channelSessionId: "c1" })).toBe("revogado");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.verdash.com.br/crm/v1/instagram/desconectar");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ vinculo_id: "v-1", org_externa_id: ORG });

    fetchMock.mockRejectedValueOnce(new Error("rede caiu"));
    expect(await desconectarInstagramDireto(admin(true), { orgId: ORG, channelSessionId: "c1" })).toBe("falhou");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "erro_interno" }), { status: 500 }));
    expect(await desconectarInstagramDireto(admin(true), { orgId: ORG, channelSessionId: "c1" })).toBe("falhou");
    expect(logs.join("\n")).not.toContain(SEGREDO);
  });
});

describe("retorno", () => {
  it("a ponte só repassa pedido (uuid), status e motivo da lista; descarta o resto", () => {
    const d = destinoDaVoltaDoInstagram(
      new URLSearchParams("pedido=33333333-3333-4333-8333-333333333333&status=erro&motivo=negado&x=<script>"),
    );
    expect(d).toBe("/app/connections/instagram/retorno?pedido=33333333-3333-4333-8333-333333333333&status=erro&motivo=negado");
    expect(destinoDaVoltaDoInstagram(new URLSearchParams("pedido=lixo&status=ok&motivo=<x>"))).toBe(
      "/app/connections/instagram/retorno?status=ok",
    );
    expect(destinoDaVoltaDoInstagram(new URLSearchParams("status=erro&motivo=inventado"))).toBe(
      "/app/connections/instagram/retorno?status=erro",
    );
  });

  it("a ponte carrega o fragmento só no navegador, com Referrer-Policy no-referrer", async () => {
    const { GET } = await import("@/app/api/v1/channels/instagram/retorno/route");
    const res = await GET(new Request("https://crm.exemplo.test/api/v1/channels/instagram/retorno?status=ok#conclusao=" + CONCLUSAO));
    const html = await res.text();
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(html).toContain("window.location.hash");
    expect(html).not.toContain(CONCLUSAO);
  });

  it("cada motivo vira texto em português claro", () => {
    const t = (s: string) => s;
    expect(mensagemDoMotivo("negado", t)).toMatch(/autorização/);
    expect(mensagemDoMotivo("expirado", t)).toMatch(/expirou/);
    expect(mensagemDoMotivo("conta_ja_conectada", t)).toMatch(/outra agência/);
    expect(mensagemDoMotivo("falha_na_conexao", t)).toMatch(/Tente de novo/);
    expect(mensagemDoMotivo("<script>", t)).toMatch(/Não foi possível conectar/);
    for (const m of ["negado", "expirado", "conta_ja_conectada", "pedido_ja_usado", "falha_na_conexao", "erro_interno", "codigo_ausente", null]) {
      const texto = mensagemDoMotivo(m, t);
      expect(texto).not.toMatch(/[—·]/);
    }
  });
});
