import { describe, expect, it } from "vitest";

import type { FlowGraph } from "@/lib/followup/graph-schema";
import { CADENCE_SETTINGS_PADRAO } from "./settings";
import { validarPublicacaoDaCadencia } from "./validar-publicacao";

/** Dublê mínimo do Supabase: devolve linhas por tabela, ignora filtros. */
function adminFalso(tabelas: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(tabela: string) {
      const linhas = tabelas[tabela] ?? [];
      const q = {
        select: () => q,
        eq: () => q,
        in: () => Promise.resolve({ data: linhas, error: null }),
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      };
      return q;
    },
  } as never;
}

const FUNIL = "11111111-1111-4111-8111-111111111111";
const OUTRO_FUNIL = "22222222-2222-4222-8222-222222222222";
const ETAPA = "33333333-3333-4333-8333-333333333333";

const politica = { ...CADENCE_SETTINGS_PADRAO, legal_basis_ref: "LIA-2026 lojistas" };

function grafo(texto: string, extra: FlowGraph["nodes"] = []): FlowGraph {
  return {
    nodes: [
      { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
      { id: "m", type: "action", label: "Msg", position: { x: 0, y: 1 }, config: { mode: "text", body: texto } },
      ...extra,
      { id: "f", type: "end", label: "Fim", position: { x: 0, y: 9 }, config: { outcome: "exhausted" } },
    ],
    edges: [],
  };
}

const pointerOk = {
  pipeline_id: FUNIL,
  channel_session_id: "sessao-1",
  cadence_settings: politica,
  trigger_config: { kind: "stage_change", params: { stage_id: ETAPA } },
};

const bancoOk = {
  channel_sessions: [{ id: "sessao-1", status: "WORKING", archived_at: null }],
  crm_stages: [{ id: ETAPA, pipeline_id: FUNIL, is_lost: false, is_archived: false }],
};

describe("publicação da cadência", () => {
  it("controle: cadência completa passa sem erro", async () => {
    const erros = await validarPublicacaoDaCadencia(adminFalso(bancoOk), "org", pointerOk, grafo("Oi {{primeiro_nome|tudo bem}}"));
    expect(erros).toEqual([]);
  });

  it("sem base legal não publica", async () => {
    const { legal_basis_ref: _l, ...semLia } = politica;
    const erros = await validarPublicacaoDaCadencia(
      adminFalso(bancoOk),
      "org",
      { ...pointerOk, cadence_settings: semLia },
      grafo("Oi"),
    );
    expect(erros.map((e) => e.code)).toContain("cadencia_politica_incompleta");
  });

  it("número desconectado não publica", async () => {
    const erros = await validarPublicacaoDaCadencia(
      adminFalso({ ...bancoOk, channel_sessions: [{ id: "sessao-1", status: "STOPPED", archived_at: null }] }),
      "org",
      pointerOk,
      grafo("Oi"),
    );
    expect(erros.map((e) => e.code)).toContain("cadencia_numero_desconectado");
  });

  it("etapa do gatilho de OUTRO funil é recusada", async () => {
    const erros = await validarPublicacaoDaCadencia(
      adminFalso({ ...bancoOk, crm_stages: [{ id: ETAPA, pipeline_id: OUTRO_FUNIL, is_lost: false, is_archived: false }] }),
      "org",
      pointerOk,
      grafo("Oi"),
    );
    expect(erros.map((e) => e.code)).toContain("cadencia_etapa_fora_do_funil");
  });

  it("passo que move para etapa de PERDA é recusado", async () => {
    const erros = await validarPublicacaoDaCadencia(
      adminFalso({ ...bancoOk, crm_stages: [{ id: ETAPA, pipeline_id: FUNIL, is_lost: true, is_archived: false }] }),
      "org",
      { ...pointerOk, trigger_config: { kind: "manual" } },
      grafo("Oi", [
        { id: "mv", type: "action", label: "Mover", position: { x: 0, y: 2 }, config: { mode: "move_stage", stage_id: ETAPA } },
      ]),
    );
    expect(erros.map((e) => e.code)).toContain("cadencia_etapa_de_perda");
  });

  it("variável com erro de digitação é recusada (em qualquer variante)", async () => {
    const g = grafo("Oi {{primeiro_nome}}");
    const msg = g.nodes[1]!;
    if (msg.type === "action" && msg.config.mode === "text") msg.config.variants = ["Olá {{nome_fantasia}}"];
    const erros = await validarPublicacaoDaCadencia(adminFalso(bancoOk), "org", pointerOk, g);
    expect(erros.map((e) => e.code)).toContain("cadencia_variavel_desconhecida");
  });

  it("spintax sem fechar é recusado", async () => {
    const erros = await validarPublicacaoDaCadencia(adminFalso(bancoOk), "org", pointerOk, grafo("Oi {tudo bem|como vai"));
    expect(erros.map((e) => e.code)).toContain("cadencia_spintax_invalido");
  });
});
