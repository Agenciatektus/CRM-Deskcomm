import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  ator: "aaaaaaaa-0000-4000-8000-000000000001",
  escrita: vi.fn(),
  audit: vi.fn(),
  ligada: true,
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
  moduloLigado: async (_db: unknown, modulo: string) => modulo === "cobranca" && h.ligada,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));

import { EscritaDePlatformAdminNegada } from "@/lib/auth/requirePlatformAdmin";

import { PATCH } from "./route";

const ID = "cccccccc-0000-4000-8000-000000000001";
const ATUAL = { id: ID, nome: "Básico", preco_cents: 4990, intervalo: "mes", arquivado_em: null as string | null };
const pedido = (body: unknown, id = ID) => [
  new NextRequest(`http://localhost/api/v1/admin/cobranca/planos/${id}`, {
    method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }),
  { params: Promise.resolve({ id }) },
] as const;

let m: { atual: typeof ATUAL | null; assinantes: number; escrita: Resposta | null };
function responder(c: Cadeia): Resposta {
  if (c.tabela === "cobranca_assinaturas") return { count: m.assinantes };
  if (operacao(c) === "update") {
    return m.escrita ?? { data: { ...m.atual, ...(argumentos(c, "update")?.[0] as object) } };
  }
  return { data: m.atual };
}
const updates = () => h.banco.cadeias.filter((c) => operacao(c) === "update");
const consultouAssinantes = () => h.banco.cadeias.some((c) => c.tabela === "cobranca_assinaturas");

beforeEach(() => {
  vi.clearAllMocks();
  h.ligada = true;
  h.escrita.mockResolvedValue({ user: { id: h.ator }, platformAdmin: { user_id: h.ator, scope: "full", mfa_required: false } });
  m = { atual: { ...ATUAL }, assinantes: 0, escrita: null };
  h.banco = bancoFalso(responder);
});

describe("PATCH /api/v1/admin/cobranca/planos/[id]", () => {
  it("renomear não consulta assinantes, grava quem e quando, audita plano_salvo", async () => {
    const res = await PATCH(...pedido({ nome: "Essencial" }));
    expect(res.status).toBe(200);
    expect(consultouAssinantes()).toBe(false);
    const payload = argumentos(updates()[0]!, "update")?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ nome: "Essencial", updated_by: h.ator });
    expect(typeof payload.updated_at).toBe("string");
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.plano_salvo", resourceId: ID }));
  });

  it("mudar o preço com assinante → 409 plano_com_assinantes; conta plano_id E plano_agendado_id; nada gravado", async () => {
    m.assinantes = 2;
    const res = await PATCH(...pedido({ preco_cents: 5990 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("plano_com_assinantes");
    const contagem = h.banco.cadeias.find((c) => c.tabela === "cobranca_assinaturas")!;
    expect(argumentos(contagem, "or")?.[0]).toBe(`plano_id.eq.${ID},plano_agendado_id.eq.${ID}`);
    expect(updates()).toEqual([]);
  });

  it("mudar o intervalo com assinante também trava", async () => {
    m.assinantes = 1;
    expect((await PATCH(...pedido({ intervalo: "ano" }))).status).toBe(409);
    expect(updates()).toEqual([]);
  });

  it("ia_propria enviado chega ao update; ligar não consulta assinantes", async () => {
    expect((await PATCH(...pedido({ ia_propria: true }))).status).toBe(200);
    expect(argumentos(updates()[0]!, "update")?.[0]).toMatchObject({ ia_propria: true, updated_by: h.ator });
    expect(consultouAssinantes()).toBe(false);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ ia_propria: true }) }),
    );
  });

  it("ia_propria false explícito chega ao update (desligar)", async () => {
    expect((await PATCH(...pedido({ ia_propria: false }))).status).toBe(200);
    expect(argumentos(updates()[0]!, "update")?.[0]).toMatchObject({ ia_propria: false });
  });

  it("PATCH sem ia_propria não o zera: o update não carrega a coluna", async () => {
    expect((await PATCH(...pedido({ nome: "Essencial" }))).status).toBe(200);
    const payload = argumentos(updates()[0]!, "update")?.[0] as Record<string, unknown>;
    expect("ia_propria" in payload).toBe(false);
  });

  it("inclui_ia junto com ia_propria no mesmo corpo → 400, nada gravado", async () => {
    expect((await PATCH(...pedido({ inclui_ia: true, ia_propria: true }))).status).toBe(400);
    expect(updates()).toEqual([]);
  });

  it("inclui_ia num plano que JÁ é de IA própria → 400; o controle (plano sem IA própria) → 200", async () => {
    m.atual = { ...ATUAL, ia_propria: true } as typeof ATUAL;
    const res = await PATCH(...pedido({ inclui_ia: true }));
    expect(res.status).toBe(400);
    expect(updates()).toEqual([]);

    m.atual = { ...ATUAL, ia_propria: false } as typeof ATUAL;
    expect((await PATCH(...pedido({ inclui_ia: true }))).status).toBe(200);
    expect(argumentos(updates()[0]!, "update")?.[0]).toMatchObject({ inclui_ia: true });
  });

  it("trocar ia_propria para false e inclui_ia para true no mesmo corpo é válido", async () => {
    m.atual = { ...ATUAL, ia_propria: true } as typeof ATUAL;
    expect((await PATCH(...pedido({ inclui_ia: true, ia_propria: false }))).status).toBe(200);
  });

  it("ia_propria que não é booleano → 400", async () => {
    expect((await PATCH(...pedido({ ia_propria: "sim" }))).status).toBe(400);
    expect(updates()).toEqual([]);
  });

  it("mudar o preço SEM assinante grava", async () => {
    expect((await PATCH(...pedido({ preco_cents: 5990 }))).status).toBe(200);
    expect(argumentos(updates()[0]!, "update")?.[0]).toMatchObject({ preco_cents: 5990 });
  });

  it("mandar o MESMO preço não conta como mudança", async () => {
    m.assinantes = 5;
    expect((await PATCH(...pedido({ preco_cents: 4990, nome: "Básico 2" }))).status).toBe(200);
    expect(consultouAssinantes()).toBe(false);
  });

  it("arquivar grava arquivado_em e audita plano_arquivado", async () => {
    expect((await PATCH(...pedido({ arquivado: true }))).status).toBe(200);
    expect(typeof (argumentos(updates()[0]!, "update")?.[0] as Record<string, unknown>).arquivado_em).toBe("string");
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.plano_arquivado" }));
  });

  it("desarquivar zera arquivado_em e audita plano_salvo", async () => {
    m.atual = { ...ATUAL, arquivado_em: "2026-09-01T00:00:00Z" };
    expect((await PATCH(...pedido({ arquivado: false }))).status).toBe(200);
    expect(argumentos(updates()[0]!, "update")?.[0]).toMatchObject({ arquivado_em: null });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.plano_salvo" }));
  });

  it("dois planos do cadastro → 409 state_conflict", async () => {
    m.escrita = { error: { code: "23505", message: "dup" } };
    const res = await PATCH(...pedido({ padrao_no_cadastro: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("state_conflict");
  });

  it("id que não é uuid → 404 sem tocar o banco (o id vai para o filtro .or)", async () => {
    expect((await PATCH(...pedido({ nome: "x" }, "1,plano_id.neq.0"))).status).toBe(404);
    expect(h.banco.cadeias).toEqual([]);
  });

  it("plano inexistente → 404", async () => {
    m.atual = null;
    expect((await PATCH(...pedido({ nome: "x" }))).status).toBe(404);
    expect(updates()).toEqual([]);
  });

  it("corpo vazio ou campo desconhecido → 400", async () => {
    expect((await PATCH(...pedido({}))).status).toBe(400);
    expect((await PATCH(...pedido({ moeda: "USD" }))).status).toBe(400);
    expect(updates()).toEqual([]);
  });

  it("chave desligada → 404; support_readonly → 403", async () => {
    h.ligada = false;
    expect((await PATCH(...pedido({ nome: "x" }))).status).toBe(404);
    h.ligada = true;
    h.escrita.mockRejectedValueOnce(new EscritaDePlatformAdminNegada("forbidden_scope", "somente leitura"));
    expect((await PATCH(...pedido({ nome: "x" }))).status).toBe(403);
    expect(updates()).toEqual([]);
  });
});
