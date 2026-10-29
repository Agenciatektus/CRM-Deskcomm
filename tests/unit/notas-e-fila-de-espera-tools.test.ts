/**
 * `crm_add_lead_note`, `crm_list_lead_notes` e `crm_join_waitlist` contra os handlers reais, com um
 * banco falso que aplica `eq`/`in`/`is`. Controles negativos: contato de outro turno, org errada.
 */
import { describe, expect, it } from "vitest";

import { crmJoinWaitlist } from "@/lib/mcp/tools/lista-de-espera";
import { crmAddLeadNote, crmListLeadNotes } from "@/lib/mcp/tools/notas-do-contato";
import { catalogEntry } from "@/lib/mcp/tools/catalog";
import { ESCOPO_DAS_ESCRITAS } from "@/lib/ai/runtime/escopo-das-escritas";
import type { McpContext } from "@/lib/mcp/types";

const ORG = "aaaaaaaa-1111-4111-8111-111111111111";
const OUTRA_ORG = "bbbbbbbb-1111-4111-8111-111111111111";
const DO_TURNO = "aaaaaaaa-2222-4222-8222-222222222222";
const DE_OUTRO = "aaaaaaaa-3333-4333-8333-333333333333";
const DE_OUTRA_ORG = "bbbbbbbb-3333-4333-8333-333333333333";
const DONO = "aaaaaaaa-5555-4555-8555-555555555555";
const TIPO = "aaaaaaaa-4444-4444-8444-444444444444";

type Linha = Record<string, unknown>;

function banco(opts: { falhaInsertEm?: string } = {}) {
  const t: Record<string, Linha[]> & { lead_notes: Linha[]; calendar_waitlist: Linha[] } = {
    contacts: [
      { id: DO_TURNO, organization_id: ORG },
      { id: DE_OUTRO, organization_id: ORG },
      { id: DE_OUTRA_ORG, organization_id: OUTRA_ORG },
    ],
    calendar_event_types: [{ id: TIPO, organization_id: ORG, slug: "escova" }],
    lead_notes: [
      { id: "n1", organization_id: ORG, contact_id: DE_OUTRO, headline: "alheia", body: "x", created_at: "2026-01-01" },
      { id: "n2", organization_id: ORG, contact_id: DO_TURNO, headline: "minha", body: "y", created_at: "2026-01-02" },
    ],
    calendar_waitlist: [],
    user_organizations: [{ user_id: DONO, organization_id: ORG, revoked_at: null }],
  };
  const from = (tabela: string) => {
    let linhas = [...(t[tabela] ?? [])];
    let inserida: Linha | null = null;
    const c: Record<string, unknown> = {
      select: () => c,
      order: () => c,
      limit: () => c,
      eq: (k: string, v: unknown) => ((linhas = linhas.filter((l) => l[k] === v)), c),
      in: (k: string, v: unknown[]) => ((linhas = linhas.filter((l) => v.includes(l[k]))), c),
      is: (k: string, v: unknown) => ((linhas = linhas.filter((l) => (l[k] ?? null) === v)), c),
      insert: (row: Linha) => {
        if (opts.falhaInsertEm === tabela) {
          inserida = null;
          const e = { error: { code: "23505", message: "duplicate" } };
          // a outra chamada "entrou primeiro"
          (t[tabela] ??= []).push({ id: "da-outra", ...row });
          c.single = () => Promise.resolve({ data: null, ...e });
          return c;
        }
        inserida = { id: `novo-${(t[tabela] ?? []).length + 1}`, ...row };
        (t[tabela] ??= []).push(inserida);
        return c;
      },
      single: () => Promise.resolve({ data: inserida ?? linhas[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok),
    };
    return c;
  };
  return { from, t };
}

function ctx(db: ReturnType<typeof banco>, contatoDoTurno?: string, org = ORG): McpContext {
  return {
    organizationId: org,
    supabase: db,
    ...(contatoDoTurno ? { contatoDoTurno } : {}),
  } as unknown as McpContext;
}

const chama = (def: { handler: (i: never, c: McpContext) => Promise<unknown> }, input: Linha, c: McpContext) =>
  def.handler(input as never, c) as Promise<Linha>;

describe("crm_add_lead_note / crm_list_lead_notes", () => {
  it("grava no contato do turno, com a organização do contexto", async () => {
    const db = banco();
    const r = await chama(crmAddLeadNote, { headline: "h", body: "b" }, ctx(db, DO_TURNO));
    expect(r).toMatchObject({ registrada: true, contact_id: DO_TURNO });
    expect(db.t.lead_notes.at(-1)).toMatchObject({ organization_id: ORG, contact_id: DO_TURNO });
  });

  it("contato de outro turno é recusado e nada é gravado", async () => {
    const db = banco();
    const antes = db.t.lead_notes.length;
    const r = await chama(crmAddLeadNote, { contact_id: DE_OUTRO, headline: "h", body: "b" }, ctx(db, DO_TURNO));
    expect(r).toMatchObject({ permitido: false, motivo: "fora_da_conversa" });
    expect(db.t.lead_notes.length).toBe(antes);
  });

  it("sem turno, contato de outra organização não existe", async () => {
    const db = banco();
    const r = await chama(crmAddLeadNote, { contact_id: DE_OUTRA_ORG, headline: "h", body: "b" }, ctx(db));
    expect(r).toMatchObject({ permitido: false, motivo: "cliente_nao_encontrado" });
  });

  it("a leitura só devolve as notas do contato do turno; outro contato é recusado", async () => {
    const db = banco();
    const ok = await chama(crmListLeadNotes, { limit: 20 }, ctx(db, DO_TURNO));
    expect((ok.notas as Linha[]).map((n) => n.id)).toEqual(["n2"]);
    const no = await chama(crmListLeadNotes, { contact_id: DE_OUTRO, limit: 20 }, ctx(db, DO_TURNO));
    expect(no).toMatchObject({ permitido: false, motivo: "fora_da_conversa" });
    const outraOrg = await chama(crmListLeadNotes, { contact_id: DO_TURNO, limit: 20 }, ctx(db, undefined, OUTRA_ORG));
    expect(outraOrg).toMatchObject({ motivo: "cliente_nao_encontrado" });
  });
});

describe("crm_join_waitlist", () => {
  it("registra a espera aberta, de autoria da IA, e a segunda chamada devolve a mesma", async () => {
    const db = banco();
    const a = await chama(crmJoinWaitlist, { event_type_slug: "escova", desired_window: "sábado de manhã" }, ctx(db, DO_TURNO));
    expect(a).toMatchObject({ registrada: true, ja_estava_na_fila: false });
    expect(db.t.calendar_waitlist[0]).toMatchObject({
      organization_id: ORG, contact_id: DO_TURNO, event_type_id: TIPO, status: "open", created_by_kind: "ai",
    });
    const b = await chama(crmJoinWaitlist, { event_type_slug: "escova" }, ctx(db, DO_TURNO));
    expect(b).toMatchObject({ registrada: true, ja_estava_na_fila: true, espera_id: a.espera_id });
    expect(db.t.calendar_waitlist.length).toBe(1);
  });

  it("contato de outro turno, contato de outra org e atendimento inexistente são recusados", async () => {
    const db = banco();
    expect(await chama(crmJoinWaitlist, { contact_id: DE_OUTRO }, ctx(db, DO_TURNO))).toMatchObject({ motivo: "fora_da_conversa" });
    expect(await chama(crmJoinWaitlist, { contact_id: DE_OUTRA_ORG }, ctx(db))).toMatchObject({ motivo: "cliente_nao_encontrado" });
    expect(await chama(crmJoinWaitlist, { event_type_slug: "nao-existe" }, ctx(db, DO_TURNO))).toMatchObject({
      registrada: false, motivo: "atendimento_nao_encontrado",
    });
    expect(db.t.calendar_waitlist.length).toBe(0);
  });
});

describe("revisão do Cassio", () => {
  it("profissional de fora da organização é recusada como resposta", async () => {
    const db = banco();
    const r = await chama(crmJoinWaitlist, { owner_user_id: "cccccccc-5555-4555-8555-555555555555" }, ctx(db, DO_TURNO));
    expect(r).toMatchObject({ registrada: false, motivo: "profissional_nao_encontrada" });
    const ok = await chama(crmJoinWaitlist, { owner_user_id: DONO }, ctx(db, DO_TURNO));
    expect(ok).toMatchObject({ registrada: true });
  });

  it("23505 no insert devolve a espera que já estava", async () => {
    const db = banco({ falhaInsertEm: "calendar_waitlist" });
    const r = await chama(crmJoinWaitlist, {}, ctx(db, DO_TURNO));
    expect(r).toMatchObject({ registrada: true, ja_estava_na_fila: true, espera_id: "da-outra" });
  });

  it("nota que estoura o orçamento do índice é recusada e nada é gravado", async () => {
    const db = banco();
    for (let i = 0; i < 60; i++) {
      db.t.lead_notes.push({ id: `x${i}`, organization_id: ORG, contact_id: DO_TURNO, headline: "uma linha de índice razoavelmente longa para encher o orçamento", body: "b", created_at: "2026-01-03" });
    }
    const antes = db.t.lead_notes.length;
    const r = await chama(crmAddLeadNote, { headline: "mais uma", body: "b" }, ctx(db, DO_TURNO));
    expect(r).toMatchObject({ registrada: false, motivo: "indice_de_notas_cheio" });
    expect(db.t.lead_notes.length).toBe(antes);
  });
});

describe("registro", () => {
  it.each(["crm_join_waitlist", "crm_add_lead_note"])("%s está no catálogo e na tabela de escopo", (nome) => {
    expect(catalogEntry(nome)).toBeDefined();
    expect(ESCOPO_DAS_ESCRITAS[nome]).toMatchObject({ contact_id: "contato" });
  });
  it("crm_list_lead_notes está no catálogo", () => expect(catalogEntry("crm_list_lead_notes")).toBeDefined());
});
