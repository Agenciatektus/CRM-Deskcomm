// @vitest-environment node
//
// UM NEGÓCIO ABERTO POR CONTATO NO FUNIL (migration 9082, 28/10/2026).
//
// O defeito: um contato do Salão Fabiana Lopes ganhou dois negócios abertos no
// mesmo funil (um `whatsapp`, outro `importacao_planilha` 29 min depois). Estes
// casos provam, no `createLeadHandler`:
//  1. origem automática com aberto no funil: devolve o EXISTENTE com
//     `reaproveitado: true`, sem INSERT e sem `lead.created`;
//  2. corrida: o INSERT esbarra no índice (23505 com o nome dele): relê e
//     reaproveita, em vez de 500;
//  3. 23505 do índice com o vencedor invisível (RLS): 409, nunca a linha;
//  4. controle negativo: `manual` cria mesmo com aberto (a tela só avisa);
//  5. controle negativo: 23505 de OUTRO índice segue 500.

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/atendimento/origem", () => ({ observeServiceOrigin: async () => "humano" }));

import { createLeadHandler } from "@/app/api/v1/leads/_handler";
import {
  INDICE_DO_LEAD_ABERTO_UNICO,
  ehViolacaoDoLeadUnico,
  entraNoLeadUnico,
} from "@/lib/leads/negocio-aberto-duplicado";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FUNIL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTATO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ETAPA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ABERTO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOVO = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const ctx = { organization_id: ORG, actor: { type: "user" as const, id: "u1" }, requestId: "r1" };
const payload = (source: string) => ({
  pipeline_id: FUNIL,
  stage_id: ETAPA,
  title: "Negócio",
  contact_id: CONTATO,
  tags: [],
  source,
});

const VIOLACAO = {
  code: "23505",
  message: `duplicate key value violates unique constraint "${INDICE_DO_LEAD_ABERTO_UNICO}"`,
};

/** `abertoNaLeitura[n]`: o que a n-ésima busca do aberto do contato devolve. */
function banco(opcoes: { abertoNaLeitura: boolean[]; erroNoInsert?: { code: string; message: string } }) {
  const inseridos: Record<string, unknown>[] = [];
  let leituras = 0;
  const from = (tabela: string) => {
    const filtros: unknown[][] = [];
    const q: Record<string, unknown> = {};
    for (const nome of ["select", "neq", "is", "order", "limit"]) q[nome] = () => q;
    q.eq = (...a: unknown[]) => (filtros.push(a), q);
    q.insert = (linha: Record<string, unknown>) => (inseridos.push(linha), q);
    q.maybeSingle = async () => {
      if (tabela === "crm_stages") return { data: { id: ETAPA, pipeline_id: FUNIL, organization_id: ORG }, error: null };
      if (tabela === "contacts") return { data: { id: CONTATO, is_personal: false }, error: null };
      if (tabela === "organizations") return { data: { currency: "BRL" }, error: null };
      if (tabela === "crm_leads" && filtros.some(([c, v]) => c === "status" && v === "open")) {
        const visivel = opcoes.abertoNaLeitura[leituras++] ?? false;
        return { data: visivel ? { id: ABERTO, status: "open", pipeline_id: FUNIL } : null, error: null };
      }
      return { data: null, error: null };
    };
    q.single = async () =>
      opcoes.erroNoInsert
        ? { data: null, error: opcoes.erroNoInsert }
        : { data: { ...inseridos.at(-1), id: NOVO }, error: null };
    q.then = (ok: (v: { data: null; error: null }) => void) => ok({ data: null, error: null });
    return q;
  };
  return { cliente: { from } as never, inseridos, leituras: () => leituras };
}

const leadCreated = () =>
  rpc.mock.calls.filter((c) => (c as unknown[])[1] && ((c as unknown[])[1] as { p_event_type?: string }).p_event_type === "lead.created");

beforeEach(() => vi.clearAllMocks());

describe("9082: regra das origens", () => {
  it("manual e nuvemshop ficam de fora; o resto entra", () => {
    expect(entraNoLeadUnico("manual")).toBe(false);
    expect(entraNoLeadUnico("nuvemshop")).toBe(false);
    expect(entraNoLeadUnico(undefined)).toBe(false);
    for (const s of ["whatsapp", "importacao_planilha", "automation", "webhook", "campanha", "ai_agent"]) {
      expect(entraNoLeadUnico(s)).toBe(true);
    }
  });

  it("só o 23505 DESTE índice é a violação", () => {
    expect(ehViolacaoDoLeadUnico(VIOLACAO)).toBe(true);
    expect(ehViolacaoDoLeadUnico({ code: "23505", message: "x", details: `Key ... ${INDICE_DO_LEAD_ABERTO_UNICO}` })).toBe(true);
    expect(ehViolacaoDoLeadUnico({ code: "23505", message: 'violates "uniq_crm_leads_org_source_external"' })).toBe(false);
    expect(ehViolacaoDoLeadUnico({ code: "22023", message: INDICE_DO_LEAD_ABERTO_UNICO })).toBe(false);
    expect(ehViolacaoDoLeadUnico(null)).toBe(false);
  });
});

describe("9082: createLeadHandler reaproveita o aberto", () => {
  it("planilha com aberto no funil: devolve o existente, sem INSERT nem lead.created", async () => {
    const b = banco({ abertoNaLeitura: [true] });
    const lead = await createLeadHandler(b.cliente, ctx, payload("importacao_planilha"));
    expect(lead).toMatchObject({ id: ABERTO, reaproveitado: true });
    expect(b.inseridos).toHaveLength(0);
    expect(leadCreated()).toHaveLength(0);
  });

  it("corrida: o índice recusa o INSERT e o vencedor é devolvido, não 500", async () => {
    const b = banco({ abertoNaLeitura: [false, true], erroNoInsert: VIOLACAO });
    const lead = await createLeadHandler(b.cliente, ctx, payload("automation"));
    expect(lead).toMatchObject({ id: ABERTO, reaproveitado: true });
    expect(b.inseridos).toHaveLength(1);
    expect(leadCreated()).toHaveLength(0);
  });

  it("corrida com o vencedor invisível: 409 lead_aberto_existente, sem a linha", async () => {
    const b = banco({ abertoNaLeitura: [false, false], erroNoInsert: VIOLACAO });
    const erro = await createLeadHandler(b.cliente, ctx, payload("webhook")).catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 409, code: "lead_aberto_existente" });
  });

  it("CONTROLE: manual cria mesmo com aberto no funil (não pergunta)", async () => {
    const b = banco({ abertoNaLeitura: [true] });
    const lead = await createLeadHandler(b.cliente, ctx, payload("manual"));
    expect(lead).toMatchObject({ id: NOVO });
    expect(lead).not.toHaveProperty("reaproveitado");
    expect(b.leituras()).toBe(0);
    expect(leadCreated()).toHaveLength(1);
  });

  it("CONTROLE: 23505 de outro índice segue 500", async () => {
    const b = banco({
      abertoNaLeitura: [false, true],
      erroNoInsert: { code: "23505", message: 'violates "uniq_crm_leads_org_source_external"' },
    });
    const erro = await createLeadHandler(b.cliente, ctx, payload("whatsapp")).catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 500, code: "internal_error" });
  });
});
