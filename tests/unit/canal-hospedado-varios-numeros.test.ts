/**
 * A rota de conexão do número hospedado com MAIS DE UM número na organização.
 *
 * Reproduz o caso real de 25/09/2026: a organização tinha o número A; conectar o
 * número B ATUALIZAVA a linha de A (trocando token, telefone e segredo), e A seguia
 * entregando no mesmo endereço com o segredo antigo — tudo recusado.
 *
 * O que roda de verdade: a rota e a decisão (`escolherSessaoHospedada`). Dublês:
 * autorização, banco, cifra, a validação do token e o registro do webhook lá fora.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: vi.fn(async () => "v1:cifrado") }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com" } }));
vi.mock("@/lib/channels/connect", async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    listHostedSessions: vi.fn(),
    saveHostedSession: vi.fn(),
    validateHostedToken: vi.fn(),
    ligarRecebimentoHospedado: vi.fn(async () => ({ ok: true })),
    trocarCodigoHospedado: vi.fn(),
  };
});

import { requireRole } from "@/lib/auth/require-role";
import {
  ligarRecebimentoHospedado,
  listHostedSessions,
  saveHostedSession,
  trocarCodigoHospedado,
  validateHostedToken,
  type HostedSession,
} from "@/lib/channels/connect";
import { GET, POST } from "@/app/api/v1/channels/hosted/route";

const A: HostedSession = {
  id: "canal-a",
  instanceName: "inst-a",
  vinculoId: null,
  phoneNumber: "+5513900000001",
  displayName: "Loja A",
  status: "WORKING",
  webhookPathToken: "tok-a",
  hasToken: true,
  archivedAt: null,
};

function pedido(corpo: unknown): NextRequest {
  return new NextRequest("https://crm.exemplo.com/api/v1/channels/hosted", {
    method: "POST",
    body: JSON.stringify(corpo),
  });
}

function gravado(): { existingId: string | null; webhookPathToken: string; instanceName: string } {
  const chamada = vi.mocked(saveHostedSession).mock.calls[0];
  if (!chamada) throw new Error("nada foi gravado");
  return chamada[1] as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u", idioma: "pt-BR" },
    org: { orgId: "org-1", name: "Loja" },
  } as never);
  vi.mocked(saveHostedSession).mockResolvedValue({ error: null });
  vi.mocked(listHostedSessions).mockResolvedValue([A]);
});

describe("conectar um SEGUNDO número", () => {
  it("pelo token: cria canal novo, com endereço novo, e não toca no primeiro", async () => {
    vi.mocked(validateHostedToken).mockResolvedValue({
      ok: true,
      instanceName: "inst-b",
      phoneNumber: "+5513900000002",
      displayName: "Loja B",
      connected: true,
    });

    const r = await POST(pedido({ token: "token-do-numero-b" }));
    expect(r.status).toBe(200);

    const g = gravado();
    expect(g.existingId).toBeNull();
    expect(g.instanceName).toBe("inst-b");
    expect(g.webhookPathToken).not.toBe("tok-a");
    expect(vi.mocked(ligarRecebimentoHospedado).mock.calls[0]?.[0].webhookUrl).not.toContain("tok-a");
  });

  it("pelo código: também cria canal novo", async () => {
    vi.mocked(trocarCodigoHospedado).mockResolvedValue({
      ok: true,
      vinculoId: "v",
      instanceName: "inst-b",
      token: "maquina",
      phoneNumber: "+5513900000002",
      displayName: "Loja B",
      connected: true,
      recebimentoLigado: true,
      recebimentoAviso: null,
    } as never);

    const r = await POST(pedido({ codigo: "XK4P9T2MQW" }));
    expect(r.status).toBe(200);
    expect(gravado().existingId).toBeNull();
  });
});

describe("reconectar o MESMO número", () => {
  it("pelo token: atualiza a própria linha e mantém o endereço", async () => {
    vi.mocked(validateHostedToken).mockResolvedValue({
      ok: true,
      instanceName: "inst-a",
      phoneNumber: "+5513900000001",
      displayName: "Loja A",
      connected: true,
    });

    await POST(pedido({ token: "token-do-numero-a" }));
    const g = gravado();
    expect(g.existingId).toBe("canal-a");
    expect(g.webhookPathToken).toBe("tok-a");
  });

  it("pelo código: atualiza a própria linha", async () => {
    vi.mocked(trocarCodigoHospedado).mockResolvedValue({
      ok: true,
      vinculoId: "v",
      instanceName: "inst-a",
      token: "maquina",
      phoneNumber: "+5513900000001",
      displayName: "Loja A",
      connected: true,
      recebimentoLigado: true,
      recebimentoAviso: null,
    } as never);

    await POST(pedido({ codigo: "XK4P9T2MQW" }));
    expect(gravado().existingId).toBe("canal-a");
  });
});

describe("número que já é canal de OUTRA organização", () => {
  it("responde 409 com motivo, e não 500 'duplicate key'", async () => {
    vi.mocked(listHostedSessions).mockResolvedValue([]);
    vi.mocked(validateHostedToken).mockResolvedValue({
      ok: true,
      instanceName: "inst-de-outra-org",
      phoneNumber: "+5513900000009",
      displayName: "X",
      connected: true,
    });
    vi.mocked(saveHostedSession).mockResolvedValue({
      error: 'duplicate key value violates unique constraint "channel_sessions_verdash_instance_unique"',
    });

    const r = await POST(pedido({ token: "token-de-outra-org" }));
    expect(r.status).toBe(409);
    expect(ligarRecebimentoHospedado).not.toHaveBeenCalled();
  });
});

describe("GET com dois números", () => {
  it("devolve os dois, e os campos soltos descrevem o primeiro", async () => {
    const B: HostedSession = { ...A, id: "canal-b", instanceName: "inst-b", phoneNumber: "+2" };
    vi.mocked(listHostedSessions).mockResolvedValue([A, B]);

    const r = await GET(new NextRequest("https://crm.exemplo.com/api/v1/channels/hosted"));
    const corpo = (await r.json()) as {
      data: { connected: boolean; channel_session_id: string; sessions: Array<{ channel_session_id: string }> };
    };
    expect(corpo.data.connected).toBe(true);
    expect(corpo.data.sessions.map((s) => s.channel_session_id)).toEqual(["canal-a", "canal-b"]);
    expect(corpo.data.channel_session_id).toBe("canal-a");
  });
});
