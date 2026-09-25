import { describe, expect, it } from "vitest";

import { etiquetaEntraESai } from "./saidas";
import { varrerGatilhosDeTempo, type CandidataDeTempo, type VarreduraDeTempoDb } from "./varredura-de-tempo";

/**
 * A seleção (janela, quem espera quem, exclusões) é do banco e é provada contra
 * Postgres real em `tests/invariants/cadencia-candidatas-de-tempo.test.ts`.
 * Aqui: o que a varredura faz com o que o banco devolve.
 */

const candidata = (k: Partial<CandidataDeTempo> = {}): CandidataDeTempo => ({
  conversation_id: "cv-1",
  contact_id: "c-1",
  lead_id: "lead-1",
  evento_em: "2026-09-25T14:50:00.000Z",
  ...k,
});

function banco(porCadencia: Record<string, CandidataDeTempo[]>): VarreduraDeTempoDb {
  return {
    cadenciasDeTempo: async () => Object.keys(porCadencia).map((id) => ({ id, organization_id: `org-de-${id}` })),
    candidatas: async (c) => porCadencia[c.id] ?? [],
  };
}

describe("varrerGatilhosDeTempo", () => {
  it("leva cada candidata à porta com a ORGANIZAÇÃO DA CADÊNCIA, o negócio e o instante da violação", async () => {
    const chamadas: unknown[] = [];
    const r = await varrerGatilhosDeTempo({
      db: banco({ "cad-a": [candidata()], "cad-b": [candidata({ conversation_id: "cv-2", lead_id: "lead-2" })] }),
      inscrever: async (input) => (chamadas.push(input), { ok: true }) as never,
    });
    expect(r).toMatchObject({ cadencias: 2, candidatas: 2, inscritos: 2 });
    expect(chamadas).toEqual([
      {
        organizationId: "org-de-cad-a",
        pointerId: "cad-a",
        leadId: "lead-1",
        eventoEm: "2026-09-25T14:50:00.000Z",
        origem: "gatilho_tempo",
        conversationId: "cv-1",
      },
      {
        organizationId: "org-de-cad-b",
        pointerId: "cad-b",
        leadId: "lead-2",
        eventoEm: "2026-09-25T14:50:00.000Z",
        origem: "gatilho_tempo",
        conversationId: "cv-2",
      },
    ]);
  });

  it("recusa da porta é contada por motivo (para aparecer no log), não engolida", async () => {
    const r = await varrerGatilhosDeTempo({
      db: banco({ "cad-a": [candidata(), candidata({ conversation_id: "cv-2" })] }),
      inscrever: async () => ({ ok: false, motivo: "teto_do_dia" }) as never,
    });
    expect(r.inscritos).toBe(0);
    expect(r.recusas).toEqual({ teto_do_dia: 2 });
  });

  it("sem cadência de tempo no ar, não chama nada", async () => {
    let chamou = false;
    const r = await varrerGatilhosDeTempo({
      db: banco({}),
      inscrever: async () => ((chamou = true), { ok: true }) as never,
    });
    expect(r.cadencias).toBe(0);
    expect(chamou).toBe(false);
  });
});

describe("etiquetaEntraESai", () => {
  const gatilho = { kind: "tag_added", params: { tag: "Lista fria" } };
  it("a mesma etiqueta no gatilho e na saída é recusada (sem caixa, sem espaço)", () => {
    expect(etiquetaEntraESai(gatilho, { saidas: { etiquetas: [" lista FRIA "], etapas: [], ao_fechar: true, humano_assumir: true } })).toBe(true);
  });
  it("etiquetas diferentes, ou gatilho que não é de etiqueta, passam", () => {
    const saidas = { saidas: { etiquetas: ["Reunião agendada"], etapas: [], ao_fechar: true, humano_assumir: true } };
    expect(etiquetaEntraESai(gatilho, saidas)).toBe(false);
    expect(etiquetaEntraESai({ kind: "manual" }, saidas)).toBe(false);
  });
});
