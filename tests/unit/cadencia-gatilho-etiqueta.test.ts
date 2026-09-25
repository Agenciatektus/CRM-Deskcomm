/**
 * GATILHO POR ETIQUETA — `aplicarGatilhoPorEtiqueta`.
 *
 * O que ele NÃO pode fazer é tão importante quanto o que faz: etiqueta posta
 * pela própria cadência não inscreve (sem corrente de réguas), etiqueta que já
 * saiu não inscreve (o fato manda), e negócio de outro funil não entra.
 */
import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import {
  aplicarGatilhoPorEtiqueta,
  type CadenciaPorEtiqueta,
  type GatilhoEtiquetaDb,
} from "@/lib/cadencia/gatilho-etiqueta.handler";

const ORG = "org-1";
const CAD: CadenciaPorEtiqueta = { id: "cad-1", pipeline_id: "funil-1", tag: "Lista fria" };

function evento(event_type: string, entity_id: string, metadata: Record<string, unknown> = {}): EventRow {
  return {
    id: "ev-1",
    organization_id: ORG,
    event_type,
    entity_kind: event_type.startsWith("lead.") ? "crm_lead" : "contact",
    entity_id,
    payload: {},
    metadata,
    consumed_by: [],
    attempts: 0,
    created_at: "2026-09-25T15:00:00.000Z",
  };
}

function montar(db: Partial<GatilhoEtiquetaDb>) {
  const inscricoes: Array<{ pointerId: string; leadId: string; origem: string }> = [];
  const deps = {
    db: {
      cadenciasPorEtiqueta: async () => [CAD],
      lead: async () => ({ pipeline_id: "funil-1", status: "open", tags: ["lista FRIA"] }),
      tagsDoContato: async () => [],
      negocioAbertoDoContato: async () => null,
      ...db,
    } as GatilhoEtiquetaDb,
    inscrever: async (input: { pointerId: string; leadId: string; origem: string }) => {
      inscricoes.push({ pointerId: input.pointerId, leadId: input.leadId, origem: input.origem });
      return { ok: true } as never;
    },
    clock: () => new Date("2026-09-25T15:00:00.000Z"),
  };
  return { deps, inscricoes };
}

describe("gatilho por etiqueta", () => {
  it("etiqueta no negócio do funil da cadência inscreve (sem caixa, sem espaço)", async () => {
    const { deps, inscricoes } = montar({});
    const r = await aplicarGatilhoPorEtiqueta(deps, evento("lead.tag_added", "lead-1"));
    expect(r.inscritos).toBe(1);
    expect(inscricoes).toEqual([{ pointerId: "cad-1", leadId: "lead-1", origem: "gatilho_etiqueta" }]);
  });

  it("etiqueta posta PELA PRÓPRIA CADÊNCIA não inscreve ninguém (sem corrente de réguas)", async () => {
    const { deps, inscricoes } = montar({});
    const r = await aplicarGatilhoPorEtiqueta(deps, evento("lead.tag_added", "lead-1", { caused_by_cadence: "cad-9" }));
    expect(r.ignorado).toBe("da_propria_cadencia");
    expect(inscricoes).toEqual([]);
  });

  it("o fato manda: etiqueta que já saiu do negócio não inscreve", async () => {
    const { deps, inscricoes } = montar({ lead: async () => ({ pipeline_id: "funil-1", status: "open", tags: [] }) });
    await aplicarGatilhoPorEtiqueta(deps, evento("lead.tag_added", "lead-1"));
    expect(inscricoes).toEqual([]);
  });

  it("negócio de OUTRO funil, ou fechado, não entra", async () => {
    const outroFunil = montar({ lead: async () => ({ pipeline_id: "funil-2", status: "open", tags: ["Lista fria"] }) });
    await aplicarGatilhoPorEtiqueta(outroFunil.deps, evento("lead.tag_added", "lead-1"));
    expect(outroFunil.inscricoes).toEqual([]);

    const fechado = montar({ lead: async () => ({ pipeline_id: "funil-1", status: "won", tags: ["Lista fria"] }) });
    await aplicarGatilhoPorEtiqueta(fechado.deps, evento("lead.tag_added", "lead-1"));
    expect(fechado.inscricoes).toEqual([]);
  });

  it("etiqueta no CONTATO inscreve o negócio aberto dele no funil da cadência", async () => {
    const { deps, inscricoes } = montar({
      tagsDoContato: async () => ["Lista fria"],
      negocioAbertoDoContato: async (_o, contato, funil) => (contato === "c-1" && funil === "funil-1" ? "lead-7" : null),
    });
    await aplicarGatilhoPorEtiqueta(deps, evento("contact.tag_added", "c-1"));
    expect(inscricoes).toEqual([{ pointerId: "cad-1", leadId: "lead-7", origem: "gatilho_etiqueta" }]);
  });

  it("contato sem negócio aberto no funil: nada a inscrever", async () => {
    const { deps, inscricoes } = montar({ tagsDoContato: async () => ["Lista fria"] });
    await aplicarGatilhoPorEtiqueta(deps, evento("contact.tag_added", "c-1"));
    expect(inscricoes).toEqual([]);
  });

  it("recusa da porta (teto do dia, LGPD...) é contada, não engolida", async () => {
    const { deps } = montar({});
    deps.inscrever = async () => ({ ok: false, motivo: "teto_do_dia" }) as never;
    const r = await aplicarGatilhoPorEtiqueta(deps, evento("lead.tag_added", "lead-1"));
    expect(r.recusas).toEqual(["teto_do_dia"]);
  });
});
