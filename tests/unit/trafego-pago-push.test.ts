import { beforeEach, describe, expect, it, vi } from "vitest";

const fzap = vi.hoisted(() => ({
  chamadas: [] as Array<{ path: string; method?: string; body?: unknown }>,
  config: null as unknown,
}));
const enriq = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com" } }));
vi.mock("@/lib/channels/verdash/client", () => ({
  fzapRequest: async (_c: unknown, path: string, init?: { method?: string; body?: unknown }) => {
    fzap.chamadas.push({ path, method: init?.method, body: init?.body });
    return init?.method === "POST" ? {} : fzap.config;
  },
}));
vi.mock("@/lib/channels/verdash/atribuicao-enriquecida", () => ({
  completarAtribuicaoPelaVerdash: async (...a: unknown[]) => {
    enriq.chamadas.push(a);
    return null;
  },
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => void fn(),
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
}));
const adminMock = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock.valor }));

import { POST } from "@/app/api/v1/webhooks/fzap-trafego-pago/[token]/route";
import {
  canalDoToken,
  dispararEnriquecimento,
  extrairTelefones,
  hashDoToken,
  hashesIguais,
  montarConfig,
  registrarPushDeTrafegoPago,
} from "@/lib/channels/verdash/trafego-pago-push";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const CANAL = "00000000-0000-4000-8000-00000000c001";
const TOKEN = "t".repeat(43);
const CREDS = { instanceName: "i", token: "tok", vinculoId: null, baseUrl: "https://fzap.local" };

/** Banco de mentira: canal achado pelo hash, contato por telefone; guarda os filtros usados. */
function banco(opts: { hashDoCanal?: string; arquivado?: boolean; contatoId?: string | null } = {}) {
  const filtros: Record<string, unknown[]> = {};
  const updates: unknown[] = [];
  const builder = (tabela: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.update = (v: unknown) => (updates.push(v), b);
    b.eq = (c: string, v: unknown) => (((filtros[`${tabela}.${c}`] ??= []).push(v)), b);
    b.in = (c: string, v: unknown) => (((filtros[`${tabela}.${c}`] ??= []).push(v)), b);
    b.is = () => b;
    b.limit = () => b;
    b.maybeSingle = async () => {
      if (tabela === "channel_sessions") {
        const alvo = (filtros["channel_sessions.trafego_push_token_hash"] ?? [])[0];
        if (!opts.hashDoCanal || alvo !== opts.hashDoCanal || opts.arquivado) return { data: null };
        return {
          data: { id: CANAL, organization_id: ORG, trafego_push_token_hash: opts.hashDoCanal },
        };
      }
      return { data: opts.contatoId === null ? null : { id: opts.contatoId ?? "ct-1" } };
    };
    b.then = (r: (v: unknown) => unknown) => r({ error: null });
    return b;
  };
  return { admin: { from: builder } as never, filtros, updates };
}

const req = (corpo: string) =>
  new Request("https://x/api", { method: "POST", body: corpo }) as never;
const params = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  fzap.chamadas = [];
  fzap.config = null;
  enriq.chamadas = [];
  delete process.env.FZAP_TRAFEGO_PAGO_PUSH;
});

describe("token do gatilho", () => {
  it("guarda e compara o HASH, em tempo constante", () => {
    expect(hashDoToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoToken(TOKEN)).not.toContain(TOKEN);
    expect(hashesIguais(hashDoToken(TOKEN), hashDoToken(TOKEN))).toBe(true);
    expect(hashesIguais(hashDoToken(TOKEN), hashDoToken(TOKEN + "x"))).toBe(false);
    expect(hashesIguais("abc", "abcd")).toBe(false);
  });

  it("acha o canal pelo hash; curto, errado e arquivado dão null", async () => {
    const { admin } = banco({ hashDoCanal: hashDoToken(TOKEN) });
    expect(await canalDoToken(admin, TOKEN)).toEqual({
      channelSessionId: CANAL,
      organizationId: ORG,
    });
    expect(await canalDoToken(admin, "o".repeat(43))).toBeNull();
    expect(await canalDoToken(admin, "curto")).toBeNull();
    const arq = banco({ hashDoCanal: hashDoToken(TOKEN), arquivado: true });
    expect(await canalDoToken(arq.admin, TOKEN)).toBeNull();
  });

  it("rota: token inexistente e token curto dão o MESMO 404", async () => {
    adminMock.valor = banco({ hashDoCanal: hashDoToken(TOKEN) }).admin;
    const a = await POST(req("{}"), params("z".repeat(43)));
    const b = await POST(req("{}"), params("curto"));
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.text()).toBe(await b.text());
  });

  it("rota: corpo acima do teto dá 413; token válido dá 200 e dispara o PULL", async () => {
    adminMock.valor = banco({ hashDoCanal: hashDoToken(TOKEN) }).admin;
    const grande = await POST(req("x".repeat(70 * 1024)), params(TOKEN));
    expect(grande.status).toBe(413);
    const ok = await POST(req(JSON.stringify({ phone: "5511987654321" })), params(TOKEN));
    expect(ok.status).toBe(200);
    await vi.waitFor(() => expect(enriq.chamadas).toHaveLength(1));
  });
});

describe("extrairTelefones", () => {
  it("aceita formatos variados e normaliza para dígitos", () => {
    expect(
      extrairTelefones({
        data: { phone: "+55 (11) 98765-4321", chatJid: "5511911112222:12@s.whatsapp.net" },
        lead: [{ senderPhone: "5521999990000" }, { from: "447911123456" }],
      }).sort(),
    ).toEqual(["447911123456", "5511911112222", "5511987654321", "5521999990000"].sort());
  });

  it("descarta lixo, grupos, tamanhos fora de 8-15 e chaves que não são de telefone", () => {
    expect(
      extrairTelefones({
        phone: "abc",
        jid: "120363000000000000@g.us",
        number: "1234567",
        from: "1234567890123456",
        chatId: "5511987654321@lid",
        createdAt: "2026-10-25T10:00:00Z",
        campaignId: "120210000000000",
        phoneNumber: 5511987654321,
      }),
    ).toEqual([]);
  });

  it("deduplica e limita a 5; aguenta aninhamento profundo e corpo não-objeto", () => {
    const muitos = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`phone${i}`, `55119876540${String(i).padStart(2, "0")}`]),
    );
    expect(extrairTelefones(muitos)).toHaveLength(5);
    expect(
      extrairTelefones([{ phone: "5511987654321" }, { phone: "+5511987654321" }]),
    ).toEqual(["5511987654321"]);
    let fundo: Record<string, unknown> = { phone: "5511987654321" };
    for (let i = 0; i < 50; i++) fundo = { x: fundo };
    expect(extrairTelefones(fundo)).toEqual([]);
    expect(extrairTelefones(null)).toEqual([]);
    expect(extrairTelefones("5511987654321")).toEqual([]);
  });
});

describe("organização e enriquecimento", () => {
  it("a org vem do canal do token, nunca do corpo", async () => {
    const { admin, filtros } = banco();
    await dispararEnriquecimento(
      admin,
      { channelSessionId: CANAL, organizationId: ORG },
      { organization_id: "OUTRA-ORG", organizationId: "OUTRA-ORG", phone: "5511987654321" },
    );
    expect(filtros["contacts.organization_id"]).toEqual([ORG]);
    expect(enriq.chamadas).toHaveLength(1);
    expect(enriq.chamadas[0]![1]).toBe(ORG);
    expect(enriq.chamadas[0]![3]).toEqual({ ignorarEspera: true });
  });

  it("telefone sem contato nesta org não dispara nada", async () => {
    const { admin } = banco({ contatoId: null });
    const n = await dispararEnriquecimento(
      admin,
      { channelSessionId: CANAL, organizationId: ORG },
      { phone: "5511987654321" },
    );
    expect(n).toBe(0);
  });
});

describe("registro no FZAP", () => {
  it("flag desligada: não chama o FZAP", async () => {
    const r = await registrarPushDeTrafegoPago(banco().admin, {
      organizationId: ORG,
      channelSessionId: CANAL,
      creds: CREDS,
    });
    expect(r).toEqual({ registrado: false, motivo: "desligado" });
    expect(fzap.chamadas).toHaveLength(0);
  });

  it("pareado: não chama o FZAP mesmo com a flag ligada", async () => {
    process.env.FZAP_TRAFEGO_PAGO_PUSH = "1";
    const r = await registrarPushDeTrafegoPago(banco().admin, {
      organizationId: ORG,
      channelSessionId: CANAL,
      creds: { ...CREDS, vinculoId: "v1" },
    });
    expect(r).toEqual({ registrado: false, motivo: "pareado" });
    expect(fzap.chamadas).toHaveLength(0);
  });

  it("GET mascarado não é reenviado; o resto é preservado e o hash é gravado", async () => {
    process.env.FZAP_TRAFEGO_PAGO_PUSH = "true";
    fzap.config = {
      id: "c1",
      fbGraphAccessToken: "***",
      fbAdAccountId: "act_1",
      webhookActive: false,
      createdAt: "x",
    };
    const { admin, updates } = banco();
    const r = await registrarPushDeTrafegoPago(admin, {
      organizationId: ORG,
      channelSessionId: CANAL,
      creds: CREDS,
    });
    expect(r).toEqual({ registrado: true });
    const post = fzap.chamadas.find((c) => c.method === "POST")!;
    const corpo = post.body as Record<string, unknown>;
    expect(corpo).not.toHaveProperty("fbGraphAccessToken");
    expect(corpo).not.toHaveProperty("id");
    expect(corpo.fbAdAccountId).toBe("act_1");
    expect(corpo).toMatchObject({
      webhookActive: true,
      webhookOnCapture: true,
      webhookOnEnrichment: true,
    });
    expect(String(corpo.webhookUrl)).toMatch(
      /^https:\/\/crm\.exemplo\.com\/api\/v1\/webhooks\/fzap-trafego-pago\/[\w-]{43}$/,
    );
    const token = String(corpo.webhookUrl).split("/").pop()!;
    expect(updates).toEqual([{ trafego_push_token_hash: hashDoToken(token) }]);
  });

  it("webhook de terceiro não é sobrescrito", async () => {
    process.env.FZAP_TRAFEGO_PAGO_PUSH = "1";
    fzap.config = { webhookUrl: "https://outro.com/hook" };
    const r = await registrarPushDeTrafegoPago(banco().admin, {
      organizationId: ORG,
      channelSessionId: CANAL,
      creds: CREDS,
    });
    expect(r).toEqual({ registrado: false, motivo: "webhook_de_terceiro" });
    expect(fzap.chamadas.some((c) => c.method === "POST")).toBe(false);
  });

  it("montarConfig mantém token real e descarta o mascarado", () => {
    expect(montarConfig({ fbGraphAccessToken: "EAAB" }, "u")).toMatchObject({
      fbGraphAccessToken: "EAAB",
    });
    expect(montarConfig({ fbGraphAccessToken: "***" }, "u")).not.toHaveProperty(
      "fbGraphAccessToken",
    );
    expect(montarConfig(null, "u")).toMatchObject({ webhookUrl: "u" });
  });
});
