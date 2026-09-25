/**
 * SAÍDA DA CADÊNCIA NA HORA DO FATO — `aplicarSaidasDaCadencia`.
 *
 * O caso que motivou o teste: `lead.won`/`lead.lost` nascem na trigger via
 * `fn_log_event`, que grava `entity_kind = 'lead'` (e não `crm_lead`, como as
 * rotas). Filtrar pelo kind deixaria as saídas mais comuns sem efeito.
 */
import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { aplicarSaidasDaCadencia, type InscricaoDaSaida, type SaidasDb } from "@/lib/cadencia/saidas.handler";
import { SAIDAS_PADRAO } from "@/lib/cadencia/saidas";

const ORG = "org-1";

function evento(event_type: string, entity_kind: string, entity_id: string): EventRow {
  return { id: "ev-1", organization_id: ORG, event_type, entity_kind, entity_id, payload: {} } as unknown as EventRow;
}

function banco(opcoes: {
  inscricoes: InscricaoDaSaida[];
  lead?: { stage_id: string; status: string; tags: string[] } | null;
  tagsDoContato?: string[];
}) {
  const encerradas: Array<{ id: string; motivo: string }> = [];
  const consultas: unknown[] = [];
  const db: SaidasDb = {
    async inscricoesVivas(_org, alvo) {
      consultas.push(alvo);
      return opcoes.inscricoes;
    },
    async lead() {
      return opcoes.lead === undefined ? { stage_id: "s-1", status: "open", tags: [] } : opcoes.lead;
    },
    async tagsDoContato() {
      return opcoes.tagsDoContato ?? [];
    },
    async encerrar(_org, id, motivo) {
      encerradas.push({ id, motivo });
      return true;
    },
  };
  return { db, encerradas, consultas };
}

const inscricao = (settings: unknown = { saidas: SAIDAS_PADRAO }): InscricaoDaSaida => ({
  id: "enr-1",
  lead_id: "lead-1",
  contact_id: "c-1",
  cadence_settings: settings,
});

describe("saídas da cadência por evento", () => {
  it("lead.won vindo da TRIGGER (entity_kind='lead') encerra a régua", async () => {
    const { db, encerradas, consultas } = banco({
      inscricoes: [inscricao()],
      lead: { stage_id: "s-1", status: "won", tags: [] },
    });
    const r = await aplicarSaidasDaCadencia(db, evento("lead.won", "lead", "lead-1"));
    expect(consultas).toEqual([{ leadId: "lead-1" }]);
    expect(encerradas).toEqual([{ id: "enr-1", motivo: "saida_negocio_ganho" }]);
    expect(r.encerradas).toBe(1);
  });

  it("lead.tag_added das rotas (entity_kind='crm_lead') com a etiqueta de saída encerra", async () => {
    const { db, encerradas } = banco({
      inscricoes: [inscricao({ saidas: { ...SAIDAS_PADRAO, etiquetas: ["Reunião agendada"] } })],
      lead: { stage_id: "s-1", status: "open", tags: ["reunião agendada"] },
    });
    await aplicarSaidasDaCadencia(db, evento("lead.tag_added", "crm_lead", "lead-1"));
    expect(encerradas.map((e) => e.motivo)).toEqual(["saida_etiqueta"]);
  });

  it("o FATO manda, não o evento: etiqueta já removida não encerra", async () => {
    const { db, encerradas } = banco({
      inscricoes: [inscricao({ saidas: { ...SAIDAS_PADRAO, etiquetas: ["Reunião agendada"] } })],
      lead: { stage_id: "s-1", status: "open", tags: [] },
    });
    await aplicarSaidasDaCadencia(db, evento("lead.tag_added", "crm_lead", "lead-1"));
    expect(encerradas).toEqual([]);
  });

  it("contact.tag_added procura as inscrições pelo CONTATO e lê a etiqueta dele", async () => {
    const { db, encerradas, consultas } = banco({
      inscricoes: [inscricao({ saidas: { ...SAIDAS_PADRAO, etiquetas: ["Não perturbe"] } })],
      tagsDoContato: ["Não perturbe"],
    });
    await aplicarSaidasDaCadencia(db, evento("contact.tag_added", "contact", "c-1"));
    expect(consultas).toEqual([{ contactId: "c-1" }]);
    expect(encerradas.map((e) => e.motivo)).toEqual(["saida_etiqueta"]);
  });

  it("etapa de saída encerra; etapa comum não", async () => {
    const saidas = { saidas: { ...SAIDAS_PADRAO, etapas: ["99999999-9999-4999-8999-999999999999"] } };
    const naSaida = banco({ inscricoes: [inscricao(saidas)], lead: { stage_id: "99999999-9999-4999-8999-999999999999", status: "open", tags: [] } });
    await aplicarSaidasDaCadencia(naSaida.db, evento("lead.stage_changed", "crm_lead", "lead-1"));
    expect(naSaida.encerradas.map((e) => e.motivo)).toEqual(["saida_etapa"]);

    const comum = banco({ inscricoes: [inscricao(saidas)], lead: { stage_id: "s-2", status: "open", tags: [] } });
    await aplicarSaidasDaCadencia(comum.db, evento("lead.stage_changed", "crm_lead", "lead-1"));
    expect(comum.encerradas).toEqual([]);
  });

  it("'ao fechar' desligado: ganhar não encerra", async () => {
    const { db, encerradas } = banco({
      inscricoes: [inscricao({ saidas: { ...SAIDAS_PADRAO, ao_fechar: false } })],
      lead: { stage_id: "s-1", status: "won", tags: [] },
    });
    await aplicarSaidasDaCadencia(db, evento("lead.won", "lead", "lead-1"));
    expect(encerradas).toEqual([]);
  });

  it("evento sem entidade, ou de outro domínio, não consulta nada", async () => {
    const { db, consultas } = banco({ inscricoes: [inscricao()] });
    await aplicarSaidasDaCadencia(db, { ...evento("lead.won", "lead", "x"), entity_id: null } as EventRow);
    await aplicarSaidasDaCadencia(db, evento("message.received", "message", "m-1"));
    expect(consultas).toEqual([]);
  });
});
