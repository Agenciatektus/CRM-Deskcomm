/**
 * O LEAD NASCE COM O DONO QUE A CONVERSA JÁ TEM.
 *
 * ## O buraco que este arquivo fecha
 *
 * O rodízio e o "Assumir" passam o dono ao lead no momento em que ATRIBUEM a
 * conversa. Quando a conversa já tinha dono e o lead nasce depois — o paciente
 * volta a escrever numa conversa antiga —, nada atribui de novo e o card fica
 * sem responsável. Medido no Dr. Paulo em 01/10/2026: conversa assumida em
 * 23/09, lead nascido às 06:36, sem dono.
 *
 * ## Por que o teste olha o UPDATE
 *
 * O que importa é o que chega ao banco: o filtro de org e as condições
 * `owner_user_id is null` / `owner_agent_id is null`, que separam "herdar o
 * dono" de "roubar a carteira".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/leads/activity-emitter", () => ({
  emitLeadActivity: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/contacts/cliente-pela-agenda", () => ({
  lerClientePelaAgenda: vi.fn(async () => false),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const DESIREE = "44444444-4444-4444-8444-444444444444";

interface Update {
  tabela: string;
  valores: Record<string, unknown>;
  filtros: Record<string, unknown>;
}

function banco(opts: { donoDaConversa: string | null; novoLead: string | null }) {
  const updates: Update[] = [];
  const leiturasFeitas: Array<{ tabela: string; filtros: Record<string, unknown> }> = [];
  const leituras: Record<string, unknown> = {
    contacts: { is_blocked: false, display_name: "Maria", name: null, phone_number: "+5566999999999" },
    crm_leads: null, // não há lead aberto: o nascimento segue
    crm_pipelines: { id: "funil-1" },
    crm_stages: { id: "etapa-1" },
    conversations: { assigned_to_user_id: opts.donoDaConversa },
  };
  const db = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      let valores: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        update(v: Record<string, unknown>) {
          valores = v;
          return q;
        },
        eq(c: string, v: unknown) {
          filtros[`eq:${c}`] = v;
          return q;
        },
        is(c: string, v: unknown) {
          filtros[`is:${c}`] = v;
          return q;
        },
        order: () => q,
        limit: () => q,
        select: () => {
          if (valores) {
            updates.push({ tabela, valores, filtros });
            return Promise.resolve({ data: [{ id: "lead-novo" }], error: null });
          }
          return q;
        },
        maybeSingle: async () => {
          leiturasFeitas.push({ tabela, filtros });
          return { data: leituras[tabela] ?? null, error: null };
        },
      };
      return q;
    },
    async rpc(fn: string) {
      return fn === "fn_nascer_lead_da_conversa"
        ? { data: opts.novoLead, error: null }
        : { data: null, error: null };
    },
  };
  return { db, updates, leiturasFeitas };
}

const DADOS = {
  organizationId: ORG,
  contactId: CONTATO,
  conversationId: CONVERSA,
  nomeDoContato: "Maria",
  origem: { rotulo: "WhatsApp", source: "whatsapp", motivo: "mensagem recebida" },
};

beforeEach(() => vi.clearAllMocks());

describe("lead que nasce numa conversa que já tem dono", () => {
  it("herda o dono da conversa, só se estiver aberto e sem dono, na mesma org", async () => {
    const { db, updates } = banco({ donoDaConversa: DESIREE, novoLead: "lead-novo" });
    const r = await garantirLeadDaConversa(db as never, DADOS);

    expect(r.criado).toBe(true);
    const u = updates.find((x) => x.tabela === "crm_leads");
    expect(u, "o lead nasceu sem herdar o dono da conversa").toBeDefined();
    expect(u!.valores).toMatchObject({ owner_user_id: DESIREE, owner_kind: "user" });
    expect(u!.filtros["eq:organization_id"]).toBe(ORG);
    expect(u!.filtros["eq:contact_id"]).toBe(CONTATO);
    expect(u!.filtros["eq:status"]).toBe("open");
    expect(u!.filtros["is:owner_user_id"], "lead com dono não pode trocar de mão").toBe(null);
    expect(u!.filtros["is:owner_agent_id"], "lead da IA não pode ser arrancado").toBe(null);
  });

  it("o dono só é lido da conversa CERTA: mesma org, mesma conversa, mesmo contato", async () => {
    const { db, leiturasFeitas } = banco({ donoDaConversa: DESIREE, novoLead: "lead-novo" });
    await garantirLeadDaConversa(db as never, DADOS);
    const leitura = leiturasFeitas.find((l) => l.tabela === "conversations");
    expect(leitura, "o dono da conversa nem foi lido").toBeDefined();
    // Service role bypassa RLS: sem estes filtros a leitura acha a conversa de outra org.
    expect(leitura!.filtros["eq:organization_id"]).toBe(ORG);
    expect(leitura!.filtros["eq:id"]).toBe(CONVERSA);
    expect(leitura!.filtros["eq:contact_id"], "par trocado herdaria dono alheio").toBe(CONTATO);
  });

  it("conversa sem dono → lead nasce sem dono (o rodízio ou o Assumir adotam depois)", async () => {
    const { db, updates } = banco({ donoDaConversa: null, novoLead: "lead-novo" });
    const r = await garantirLeadDaConversa(db as never, DADOS);
    expect(r.criado).toBe(true);
    expect(updates.find((x) => x.tabela === "crm_leads")).toBeUndefined();
  });

  it("lead que não nasceu (já existia) → nenhum dono é escrito", async () => {
    const { db, updates } = banco({ donoDaConversa: DESIREE, novoLead: null });
    const r = await garantirLeadDaConversa(db as never, DADOS);
    expect(r).toMatchObject({ criado: false, motivo: "ja_existe" });
    expect(updates.find((x) => x.tabela === "crm_leads")).toBeUndefined();
  });
});
