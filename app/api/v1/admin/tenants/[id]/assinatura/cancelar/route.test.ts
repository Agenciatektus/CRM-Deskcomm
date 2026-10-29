import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bancoFalso, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  ator: "aaaaaaaa-0000-4000-8000-000000000001",
  escrita: vi.fn(),
  audit: vi.fn(),
  cancelarAgora: vi.fn(),
  lerSituacao: vi.fn(),
  sincronizar: vi.fn(),
  limite: true,
  banco: undefined as unknown as BancoFalso,
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: async () => false, loadAuthUser: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/requirePlatformAdmin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/requirePlatformAdmin")>()),
  requirePlatformAdminEscrita: h.escrita,
}));
vi.mock("@/lib/instalacao/modulos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/instalacao/modulos")>()),
  moduloLigado: async () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/cobranca/falhas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cobranca/falhas")>()),
  limiteDoProvedorPorOrg: async () => h.limite,
}));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: () => ({ cancelarAgora: h.cancelarAgora, lerSituacao: h.lerSituacao }) }));
vi.mock("@/lib/cobranca/sincronizar", () => ({ sincronizar: h.sincronizar }));

import { ErroDoProvedor } from "@/lib/cobranca/provedores/contrato";

import { POST } from "./route";

const TENANT = "bbbbbbbb-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: TENANT }) };
const pedido = () => new NextRequest(`http://localhost/api/v1/admin/tenants/${TENANT}/assinatura/cancelar`, { method: "POST" });

let linha: Record<string, unknown> | null;
function responder(c: Cadeia): Resposta {
  if (c.tabela === "organizations") return { data: { id: TENANT, status: "active", suspended_kind: null } };
  return { data: linha };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.limite = true;
  h.escrita.mockResolvedValue({ user: { id: h.ator }, platformAdmin: { user_id: h.ator, scope: "full", mfa_required: false } });
  h.cancelarAgora.mockResolvedValue(undefined);
  h.sincronizar.mockResolvedValue({ tipo: "isenta" });
  linha = { provedor: "stripe", provedor_cliente_id: "cus_1", provedor_assinatura_id: "sub_1" };
  h.banco = bancoFalso(responder, () => ({}));
});

describe("POST /admin/tenants/[id]/assinatura/cancelar", () => {
  it("encerra a assinatura do id gravado, audita e relê o estado", async () => {
    const res = await POST(pedido(), ctx);
    expect(res.status).toBe(200);
    expect(h.cancelarAgora).toHaveBeenCalledWith("sub_1");
    expect(h.lerSituacao).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.assinatura_cancelada", organizationId: TENANT }));
    expect(h.sincronizar).toHaveBeenCalledWith(h.banco.cliente, TENANT);
  });

  it("linha sem o id da assinatura (venda por link): pergunta ao provedor qual é a viva", async () => {
    linha = { provedor: "stripe", provedor_cliente_id: "cus_1", provedor_assinatura_id: null };
    h.lerSituacao.mockResolvedValue({ assinaturaRef: "sub_viva" });
    expect((await POST(pedido(), ctx)).status).toBe(200);
    expect(h.cancelarAgora).toHaveBeenCalledWith("sub_viva");
  });

  it("empresa isenta ou sem provedor → 409, nada cancelado", async () => {
    linha = null;
    expect((await POST(pedido(), ctx)).status).toBe(409);
    linha = { provedor: null, provedor_cliente_id: null, provedor_assinatura_id: null };
    expect((await POST(pedido(), ctx)).status).toBe(409);
    expect(h.cancelarAgora).not.toHaveBeenCalled();
  });

  it("o provedor recusa → erro do provedor, sem audit", async () => {
    h.cancelarAgora.mockRejectedValue(new ErroDoProvedor(503, "api_error", true));
    const res = await POST(pedido(), ctx);
    expect(res.status).toBe(503);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("limite de chamadas ao provedor estourado → 429", async () => {
    h.limite = false;
    expect((await POST(pedido(), ctx)).status).toBe(429);
    expect(h.cancelarAgora).not.toHaveBeenCalled();
  });
});
