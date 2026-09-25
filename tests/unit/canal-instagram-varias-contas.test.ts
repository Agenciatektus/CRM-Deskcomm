/**
 * A rota de conexão do Instagram com MAIS DE UMA conta na organização.
 *
 * O mesmo defeito do WhatsApp hospedado (25/09/2026), achado na revisão do conserto:
 * a rota escolhia "a conta desta organização" antes de saber qual conta o código
 * representava, e reescrevia aquela mantendo o endereço dela. A primeira conta
 * seguia entregando ali com o segredo velho, tudo recusado — e no Instagram nenhum
 * índice do banco seguraria (a linha não tem telefone).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn(async () => false) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: vi.fn(async () => "v1:cifrado") }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com" } }));
vi.mock("@/lib/channels/connect", async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    listInstagramSessions: vi.fn(),
    saveInstagramSession: vi.fn(),
    trocarCodigoHospedado: vi.fn(),
  };
});

import { requireRole } from "@/lib/auth/require-role";
import {
  listInstagramSessions,
  saveInstagramSession,
  trocarCodigoHospedado,
  type HostedSession,
} from "@/lib/channels/connect";
import { POST } from "@/app/api/v1/channels/instagram/route";

const CONTA_A: HostedSession = {
  id: "ig-a",
  instanceName: "inst-ig-a",
  vinculoId: "v-a",
  phoneNumber: null,
  displayName: "@loja_a",
  status: "WORKING",
  webhookPathToken: "tok-ig-a",
  hasToken: true,
  archivedAt: null,
};

function troca(instanceName: string, displayName: string) {
  return {
    ok: true,
    vinculoId: "v",
    instanceName,
    token: "maquina",
    phoneNumber: null,
    displayName,
    connected: true,
    recebimentoLigado: true,
    recebimentoAviso: null,
  } as never;
}

function gravado(): { existingId: string | null; webhookPathToken: string } {
  const chamada = vi.mocked(saveInstagramSession).mock.calls[0];
  if (!chamada) throw new Error("nada foi gravado");
  return chamada[1] as never;
}

function pedido(): NextRequest {
  return new NextRequest("https://crm.exemplo.com/api/v1/channels/instagram", {
    method: "POST",
    body: JSON.stringify({ codigo: "XK4P9T2MQW" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u", idioma: "pt-BR" },
    org: { orgId: "org-1", name: "Loja" },
  } as never);
  vi.mocked(saveInstagramSession).mockResolvedValue({ error: null });
  vi.mocked(listInstagramSessions).mockResolvedValue([CONTA_A]);
});

describe("conectar uma SEGUNDA conta de Instagram", () => {
  it("cria canal novo, com endereço novo, e não reescreve a primeira", async () => {
    vi.mocked(trocarCodigoHospedado).mockResolvedValue(troca("inst-ig-b", "@loja_b"));

    const r = await POST(pedido());
    expect(r.status).toBe(200);
    expect(gravado().existingId).toBeNull();
    expect(gravado().webhookPathToken).not.toBe("tok-ig-a");
  });
});

describe("reconectar a MESMA conta", () => {
  it("atualiza a própria linha", async () => {
    vi.mocked(trocarCodigoHospedado).mockResolvedValue(troca("inst-ig-a", "@loja_a"));

    await POST(pedido());
    expect(gravado().existingId).toBe("ig-a");
  });
});
