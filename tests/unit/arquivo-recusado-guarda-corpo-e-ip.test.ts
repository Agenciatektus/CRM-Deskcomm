import { beforeEach, describe, expect, it, vi } from "vitest";

import { corpoUnicoParaArquivo } from "@/lib/channels/corpo-do-arquivo";

/**
 * A LINHA QUE NÃO CONFERIU GUARDA O CORPO CRU E A ORIGEM (P2 do @Cassio_SecRev na #246).
 *
 * A #246 passou a gravar o corpo uma vez só (`payload_parsed`) e a tirar os
 * cabeçalhos de proxy. Certo para a entrega boa; errado para a recusada: é a
 * linha que alguém vai reconferir byte a byte, e o IP é a pista de quem tentou
 * forjar. Aqui, pelas rotas reais: a linha recusada guarda texto e IP; a aceita
 * continua sem os dois.
 */

const SEGREDO = "s3gredo-do-canal-ip";
const IP = "198.51.100.77";

const estado = {
  inserts: [] as Array<Record<string, unknown>>,
  assinaturaCanal: true,
  wahaAuth: { ok: true, signatureVerified: true } as { ok: true; signatureVerified: boolean },
};

function tabelaDoArquivo() {
  return {
    insert(linha: Record<string, unknown>) {
      estado.inserts.push(linha);
      return { select: () => ({ maybeSingle: async () => ({ data: { id: "log-1" }, error: null }) }) };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      if (tabela === "channel_sessions") {
        const resposta = {
          data: {
            id: "sessao-1",
            organization_id: "org-1",
            provider: "verdash",
            display_name: null,
            phone_number: null,
            webhook_secret_encrypted: "cifrado",
            archived_at: null,
          },
          error: null,
        };
        const cadeia = { select: () => cadeia, eq: () => cadeia, maybeSingle: async () => resposta };
        return cadeia;
      }
      return tabelaDoArquivo();
    },
    rpc: async () => ({ data: "segredo-decifrado-longo", error: null }),
  }),
}));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: async () => SEGREDO }));
vi.mock("@/lib/channels/inbound", () => ({
  acceptsInboundWebhook: () => true,
  verifyInboundWebhookSignature: () => estado.assinaturaCanal,
  inboundPayloadBelongsToSession: async () => true,
  handleInboundWebhook: async () => ({ ok: true, body: { status: "ok" } }),
}));
vi.mock("@/lib/channels/archived", () => ({
  ARCHIVED_AT: "archived_at",
  queryTolerantToMissingArchived: async () => ({
    data: {
      id: "sess-w",
      organization_id: "org-1",
      waha_session_name: "default",
      webhook_secret_encrypted: "\\x00",
      status: "WORKING",
      is_warmup_complete: true,
      warmup_started_at: null,
    },
    error: null,
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/waha/webhook-auth", () => ({ authenticateWahaWebhook: () => estado.wahaAuth }));
vi.mock("@/lib/waha/ingest", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  dispatchWahaEvent: async () => undefined,
}));

import { POST as postCanal } from "@/app/api/v1/webhooks/channel/[token]/route";
import { POST as postWaha } from "@/app/api/v1/webhooks/waha/[token]/route";
import { limparMemoriaDeSessoes } from "@/lib/waha/sessao-do-webhook";

const CORPO_CANAL = JSON.stringify({ type: "Message", event: { Info: { ID: "A1", Chat: "5511999999999@s.whatsapp.net" } } });
const CORPO_WAHA = JSON.stringify({
  event: "message",
  session: "default",
  payload: { id: "wamid.IP", from: "5531988887777@c.us", body: "oi" },
});

const comProxy = (extra: Record<string, string>) =>
  new Headers({
    "content-type": "application/json",
    "x-forwarded-for": `${IP}, 172.70.0.1`,
    "cf-connecting-ip": IP,
    "x-real-ip": "172.70.0.1",
    "cf-ray": "8d12-GRU",
    ...extra,
  });

async function chamarCanal() {
  const req = new Request("https://crm.exemplo/api/v1/webhooks/channel/tokendarota123", {
    method: "POST",
    headers: comProxy({ "x-webhook-secret": SEGREDO }),
    body: CORPO_CANAL,
  });
  return postCanal(req as never, { params: Promise.resolve({ token: "tokendarota123" }) });
}

async function chamarWaha() {
  const req = { text: async () => CORPO_WAHA, headers: comProxy({ "x-webhook-hmac": "sha512=abc" }) };
  return postWaha(req as never, { params: Promise.resolve({ token: "token-da-rota-de-producao-0001" }) });
}

const ORIGEM = ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"];
const origemNa = (linha: Record<string, unknown>) =>
  Object.keys((linha.headers ?? {}) as Record<string, string>).filter((k) => ORIGEM.includes(k.toLowerCase())).sort();

beforeEach(() => {
  estado.inserts = [];
  estado.assinaturaCanal = true;
  estado.wahaAuth = { ok: true, signatureVerified: true };
  limparMemoriaDeSessoes();
});

describe("rota dos canais", () => {
  it("assinatura recusada: a linha guarda o texto cru E a origem", async () => {
    estado.assinaturaCanal = false;
    const r = await chamarCanal();
    expect(r.status).toBe(401);
    expect(estado.inserts).toHaveLength(1);
    const linha = estado.inserts[0]!;
    expect(linha.raw_body).toBe(CORPO_CANAL);
    expect(origemNa(linha)).toEqual(ORIGEM);
    expect((linha.headers as Record<string, string>)["cf-connecting-ip"]).toBe(IP);
    // A credencial continua fora, mesmo na linha recusada.
    expect(JSON.stringify(linha)).not.toContain(SEGREDO);
  });

  it("assinatura boa: sem texto cru e sem origem (o regime da #246)", async () => {
    const r = await chamarCanal();
    expect(r.status).toBe(200);
    const linha = estado.inserts[0]!;
    expect(linha.raw_body).toBeNull();
    expect(linha.payload_parsed).toEqual(JSON.parse(CORPO_CANAL));
    expect(origemNa(linha)).toEqual([]);
  });
});

describe("rota do WAHA", () => {
  it("entrega sem assinatura (valid_signature false): texto cru e origem", async () => {
    estado.wahaAuth = { ok: true, signatureVerified: false };
    await chamarWaha();
    const linha = estado.inserts[0]!;
    expect(linha.valid_signature).toBe(false);
    expect(linha.raw_body).toBe(CORPO_WAHA);
    expect(origemNa(linha)).toEqual(ORIGEM);
  });

  it("entrega assinada: sem texto cru e sem origem", async () => {
    await chamarWaha();
    const linha = estado.inserts[0]!;
    expect(linha.valid_signature).toBe(true);
    expect(linha.raw_body).toBeNull();
    expect(origemNa(linha)).toEqual([]);
  });
});

describe("a regra, pura", () => {
  it("só `false` guarda o texto; `true`, `null` e ausente seguem a regra de um corpo só", () => {
    const raw = '{"a":1}';
    expect(corpoUnicoParaArquivo(raw, { a: 1 }, { assinaturaValida: false }).raw_body).toBe(raw);
    for (const v of [true, null, undefined]) {
      expect(corpoUnicoParaArquivo(raw, { a: 1 }, { assinaturaValida: v }).raw_body).toBeNull();
    }
  });
});
