/**
 * Conversão por ETAPA (decisão do Peterson, 19/10/2026; migration 9054).
 *
 * Cada etapa decide se envia conversão ao receber um negócio. Vigiado aqui, com
 * controle negativo: etapa desligada não envia; ligada envia; recompra (nova
 * entrada) envia de novo; o mesmo arrasto (`lead.won` + `lead.stage_changed`) e o
 * reprocessamento não duplicam; troca de funil nunca envia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { MARCA_DA_ENTRADA } from "@/lib/leads/entrada-pela-troca";

const mocks = vi.hoisted(() => ({ enviar: vi.fn(), admin: vi.fn(), atribuicao: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/conversoes/leitura-da-atribuicao", () => ({ lerAtribuicao: mocks.atribuicao }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({
  lerCredencial: async () => ({ ok: true, credencial: { testEventCode: null } }),
}));
vi.mock("@/lib/plataformas-de-anuncio/registry", () => ({
  ehPlataformaConhecida: () => true,
  transporteDe: () => ({ enviar: mocks.enviar }),
}));

const { conversaoDeVendaHandler } = await import("@/lib/conversoes/envio.handler");
const { resolverEntrada } = await import("@/lib/conversoes/entrada-na-etapa");

const GANHO = "etapa-ganho";
const T1 = "2026-10-19T10:00:00.000Z";
const T2 = "2026-11-19T10:00:00.000Z";

let lead: Record<string, unknown>;
let etapa: Record<string, unknown> | null;
let linha: Record<string, unknown> | null;

const evento = (tipo: string, extra: Partial<EventRow> = {}): EventRow => ({
  id: "e",
  organization_id: "org",
  event_type: tipo,
  entity_kind: "crm_lead",
  entity_id: "lead",
  payload: tipo === "lead.stage_changed" ? { to_stage_id: GANHO } : {},
  metadata: {},
  consumed_by: [],
  attempts: 0,
  created_at: T1,
  ...extra,
});

/** O upsert com a regra de `fn_preservar_conversao_enviada` (9054). */
function gravar(novo: Record<string, unknown>) {
  if (!linha) return void (linha = { created_at: new Date().toISOString(), ...novo });
  const nova =
    typeof novo.entrada_em === "string" &&
    Date.parse(novo.entrada_em) > Date.parse(String(linha.entrada_em ?? linha.created_at));
  if (nova) return void (linha = { created_at: linha.created_at, ...novo });
  if (linha.status === "sent" && novo.status !== "sent") return;
  linha = { ...linha, ...novo };
}

beforeEach(() => {
  vi.clearAllMocks();
  linha = null;
  etapa = { envia_conversao: true, evento_de_conversao: "Purchase" };
  lead = {
    id: "lead",
    status: "won",
    value_cents: 9900,
    currency: "BRL",
    closed_at: T1,
    contact_id: "c",
    stage_id: GANHO,
    stage_changed_at: T1,
  };
  mocks.enviar.mockResolvedValue({ tipo: "ok" });
  mocks.atribuicao.mockResolvedValue({
    temAtribuicao: true,
    atribuicao: { plataforma: "meta_ads", cliqueDeOrigem: "ctwa", telefone: null },
  });
  mocks.admin.mockReturnValue({
    from: (tabela: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: tabela === "crm_leads" ? lead : tabela === "crm_stages" ? etapa : linha,
          error: null,
        }),
        upsert: async (d: Record<string, unknown>) => {
          gravar(d);
          return { error: null };
        },
      };
      return q;
    },
  });
});

describe("a chave da etapa", () => {
  it("CONTROLE NEGATIVO: etapa desligada não envia nem suja o livro-razão", async () => {
    etapa = { envia_conversao: false, evento_de_conversao: null };
    expect(await conversaoDeVendaHandler.handle(evento("lead.won"))).toMatchObject({
      status: "skipped",
      detail: "etapa_sem_conversao",
    });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(linha).toBeNull();
  });

  it("etapa ligada com outro evento não manda a compra", async () => {
    etapa = { envia_conversao: true, evento_de_conversao: "QualifiedLead" };
    expect(await conversaoDeVendaHandler.handle(evento("lead.won"))).toMatchObject({
      detail: "etapa_sem_conversao",
    });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("etapa ligada envia, inclusive aberta (não precisa ser ganho)", async () => {
    lead = { ...lead, status: "open", closed_at: null };
    expect(await conversaoDeVendaHandler.handle(evento("lead.stage_changed"))).toMatchObject({
      status: "ok",
    });
    expect(mocks.enviar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ evento: "Purchase", eventoId: "lead:Purchase" }),
    );
    expect(linha).toMatchObject({ status: "sent", entrada_em: T1 });
  });
});

describe("idempotência por entrada", () => {
  it("o mesmo arrasto (lead.won + lead.stage_changed) e o reprocessamento saem uma vez", async () => {
    await conversaoDeVendaHandler.handle(evento("lead.won"));
    expect(await conversaoDeVendaHandler.handle(evento("lead.stage_changed"))).toMatchObject({
      detail: "ja_enviada",
    });
    expect(await conversaoDeVendaHandler.handle(evento("lead.won"))).toMatchObject({
      detail: "ja_enviada",
    });
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });

  it("recompra: nova entrada na etapa ligada envia de novo, com id próprio", async () => {
    await conversaoDeVendaHandler.handle(evento("lead.won"));
    lead = { ...lead, stage_changed_at: T2, closed_at: T2 };
    expect(
      await conversaoDeVendaHandler.handle(evento("lead.won", { created_at: T2 })),
    ).toMatchObject({ status: "ok" });
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
    expect(mocks.enviar.mock.calls[1]![1]).toMatchObject({
      eventoId: `lead:Purchase:${Date.parse(T2)}`,
    });
    expect(linha).toMatchObject({ status: "sent", entrada_em: T2 });
    // A recompra reprocessada não sai uma terceira vez.
    await conversaoDeVendaHandler.handle(evento("lead.stage_changed", { created_at: T2 }));
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
  });

  it("linha anterior à 9054 (sem entrada_em) conta como a entrada atual: não reenvia", async () => {
    linha = { status: "sent", platform: "meta_ads", created_at: "2026-10-19T10:05:00.000Z" };
    expect(await conversaoDeVendaHandler.handle(evento("lead.won"))).toMatchObject({
      detail: "ja_enviada",
    });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("card que já saiu da etapa antes do processamento não envia", async () => {
    lead = { ...lead, stage_id: "outra" };
    expect(await conversaoDeVendaHandler.handle(evento("lead.stage_changed"))).toMatchObject({
      detail: "saiu_da_etapa",
    });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});

describe("troca de funil nunca envia conversão", () => {
  it("a entrada pedida pela troca (#207) é pulada mesmo numa etapa ligada", async () => {
    expect(
      await conversaoDeVendaHandler.handle(
        evento("lead.stage_changed", { metadata: { [MARCA_DA_ENTRADA]: true } }),
      ),
    ).toMatchObject({ detail: "entrada_pela_troca_de_funil" });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});

describe("resolverEntrada", () => {
  it("envio em curso de uma etapa que o card já deixou segue com a entrada gravada", () => {
    expect(
      resolverEntrada({ stage_id: "outra", stage_changed_at: T2 }, GANHO, {
        status: "skipped",
        entrada_em: T1,
      }),
    ).toEqual({ tipo: "ok", entradaEm: T1, nova: false });
  });
});
