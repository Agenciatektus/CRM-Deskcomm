import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, filtros, operacao, valorDoFiltro, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  ator: "aaaaaaaa-0000-4000-8000-000000000001",
  escrita: vi.fn(),
  audit: vi.fn(),
  ligada: true,
  banco: undefined as unknown as BancoFalso,
  sincronizar: vi.fn(),
  adaptador: { clienteExiste: vi.fn(), lerSituacao: vi.fn() },
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
  moduloLigado: async (_db: unknown, modulo: string) => modulo === "cobranca" && h.ligada,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/cobranca/configuracao", () => ({ provedorDaInstalacao: async () => "stripe" }));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: () => h.adaptador, modoDoProvedor: async () => "teste" }));
vi.mock("@/lib/cobranca/sincronizar", () => ({ sincronizar: h.sincronizar }));

import { EscritaDePlatformAdminNegada } from "@/lib/auth/requirePlatformAdmin";

import { POST } from "./route";

const TENANT = "bbbbbbbb-0000-4000-8000-000000000001";
const OUTRA = "bbbbbbbb-0000-4000-8000-000000000002";
const CUS_DA_API = "cus_Abc123";
const SUB_DA_API = "sub_LidaDaApi9";

interface Mundo {
  org: Record<string, unknown> | null;
  propria: Record<string, unknown> | null;
  dono: Record<string, unknown> | null;
  escrita: Resposta | null;
}
let m: Mundo;

function responder(c: Cadeia): Resposta {
  if (c.tabela === "organizations") return { data: m.org };
  if (operacao(c) === "update") return m.escrita ?? { data: { organization_id: TENANT } };
  // select: a leitura do dono do cus_ filtra por provedor_cliente_id; a da própria linha, só por organization_id.
  return { data: valorDoFiltro(c, "eq", "provedor_cliente_id") !== undefined ? m.dono : m.propria };
}

const ctx = (id = TENANT) => ({ params: Promise.resolve({ id }) });
const pedido = (body?: unknown) =>
  new NextRequest(`http://localhost/api/v1/admin/tenants/${TENANT}/assinatura/vincular`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
const escritas = () => h.banco.cadeias.filter((c) => c.tabela === "cobranca_assinaturas" && operacao(c) !== "select");

beforeEach(() => {
  vi.clearAllMocks();
  h.ligada = true;
  h.escrita.mockResolvedValue({ user: { id: h.ator }, platformAdmin: { user_id: h.ator, scope: "full", mfa_required: false } });
  h.adaptador.clienteExiste.mockResolvedValue(true);
  h.adaptador.lerSituacao.mockResolvedValue({ assinaturaRef: SUB_DA_API, assinaturasVivas: 1 });
  h.sincronizar.mockResolvedValue({ tipo: "aplicada", estado: "ativa", mudou: true, acao: "nenhuma" });
  m = {
    org: { id: TENANT, status: "active", suspended_kind: null },
    propria: { organization_id: TENANT, provedor: null, provedor_cliente_id: null },
    dono: null,
    escrita: null,
  };
  h.banco = bancoFalso(responder);
});

describe("POST vincular: portões", () => {
  it("chave desligada → 404, nada lido nem escrito", async () => {
    h.ligada = false;
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(404);
    expect(h.banco.cadeias).toEqual([]);
  });
  it("sem escrita de platform admin → 403, nada lido nem escrito", async () => {
    h.escrita.mockRejectedValueOnce(new EscritaDePlatformAdminNegada("forbidden_scope", "somente leitura"));
    const res = await POST(pedido({ cliente_ref: CUS_DA_API }), ctx());
    expect(res.status).toBe(403);
    expect(h.banco.cadeias).toEqual([]);
    expect(h.sincronizar).not.toHaveBeenCalled();
  });
  it("id que não é uuid → 404", async () => {
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx("x"))).status).toBe(404);
    expect(h.banco.cadeias).toEqual([]);
  });
});

describe("POST vincular: a ligação", () => {
  it("grava exatamente os ids lidos da API, filtra pela empresa da URL e sincroniza essa empresa", async () => {
    const res = await POST(pedido({ cliente_ref: CUS_DA_API }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ vinculada: true, estado: { tipo: "aplicada", estado: "ativa" } });
    expect(h.adaptador.lerSituacao).toHaveBeenCalledWith({ clienteRef: CUS_DA_API });
    expect(escritas()).toHaveLength(1);
    const [update] = escritas();
    expect(argumentos(update!, "update")?.[0]).toEqual({
      provedor: "stripe",
      modo: "teste",
      provedor_cliente_id: CUS_DA_API,
      provedor_assinatura_id: SUB_DA_API,
    });
    expect(filtros(update!)).toEqual([["eq", "organization_id", TENANT]]);
    expect(h.sincronizar).toHaveBeenCalledTimes(1);
    expect(h.sincronizar.mock.calls[0]![1]).toBe(TENANT);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TENANT, action: "cobranca.provedor_conectado" }));
  });
  it("corpo que tenta mandar o id da assinatura → 400 (estrito), nada gravado", async () => {
    const res = await POST(pedido({ cliente_ref: CUS_DA_API, provedor_assinatura_id: "sub_forjada" }), ctx());
    expect(res.status).toBe(400);
    expect(escritas()).toEqual([]);
  });
  it("cus_ de OUTRA empresa → 409 e nenhum write", async () => {
    m.dono = { organization_id: OUTRA };
    const res = await POST(pedido({ cliente_ref: CUS_DA_API }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("cliente_ja_vinculado");
    expect(escritas()).toEqual([]);
    expect(h.sincronizar).not.toHaveBeenCalled();
  });
  it("índice único estoura no update (corrida) → 409, sem sincronizar nem audit", async () => {
    m.escrita = { error: { code: "23505", message: "dup" } };
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(409);
    expect(h.sincronizar).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
  it("empresa já ligada a outro cus_ → 409 e nenhum write", async () => {
    m.propria = { organization_id: TENANT, provedor: "stripe", provedor_cliente_id: "cus_Outro" };
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(409);
    expect(escritas()).toEqual([]);
  });
  it("empresa sem linha (sem plano) → 409 e nenhum write", async () => {
    m.propria = null;
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(409);
    expect(escritas()).toEqual([]);
  });
  it("cliente inexistente → 422, sem write", async () => {
    h.adaptador.clienteExiste.mockResolvedValueOnce(false);
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(422);
    expect(escritas()).toEqual([]);
    expect(h.sincronizar).not.toHaveBeenCalled();
  });
  it.each([
    ["sem assinatura", { assinaturaRef: null, assinaturasVivas: 0 }],
    ["só assinatura encerrada", { assinaturaRef: "sub_velha", assinaturasVivas: 0 }],
  ])("cliente %s → 422, sem write", async (_nome, situacao) => {
    h.adaptador.lerSituacao.mockResolvedValueOnce(situacao);
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(422);
    expect(escritas()).toEqual([]);
    expect(h.sincronizar).not.toHaveBeenCalled();
  });
  it("Stripe fora do ar → 503, sem write", async () => {
    h.adaptador.lerSituacao.mockRejectedValueOnce(new Error("rede"));
    expect((await POST(pedido({ cliente_ref: CUS_DA_API }), ctx())).status).toBe(503);
    expect(escritas()).toEqual([]);
  });
});

describe("POST vincular: validação do cliente_ref", () => {
  it.each([["sub_123"], ["cus_"], ["cus_a b"], ["cus_a/../b"], [""], ["CUS_abc"]])("%j → 400, nada lido do banco", async (ref) => {
    expect((await POST(pedido({ cliente_ref: ref }), ctx())).status).toBe(400);
    expect(h.banco.cadeias).toEqual([]);
  });
  it("corpo ausente → 400", async () => {
    expect((await POST(pedido(), ctx())).status).toBe(400);
  });
});
