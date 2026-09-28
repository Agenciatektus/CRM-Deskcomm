import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TOOL_CATALOG } from "@/lib/mcp/tools/catalogo";
import {
  NUNCA_NA_CONDUCAO,
  PRESET_TOOLS,
  TOOLS_DO_ENGINE_NA_CONDUCAO,
  blocoDoObjetivo,
  ferramentasPermitidas,
  filtrarRawTools,
  obrigatoriasFaltando,
} from "./presets";
import { PRESETS_DA_CONDUCAO } from "./settings";

const NOMES_DO_CATALOGO = new Set(TOOL_CATALOG.map((t) => t.name));
/** Nomes das tools do motor, lidos do fonte (importar o turno puxaria o motor inteiro). */
const FONTE_DO_TURNO = readFileSync(join(process.cwd(), "lib", "agent-engine", "agent", "inbound-turn.ts"), "utf8");
const temToolDoMotor = (nome: string) => new RegExp(`^  ${nome}: \\{`, "m").test(FONTE_DO_TURNO);

describe("presets da condução", () => {
  it("há um preset para cada objetivo do schema", () => {
    expect(Object.keys(PRESET_TOOLS).sort()).toEqual([...PRESETS_DA_CONDUCAO].sort());
  });

  it("nenhum preset libera ferramenta proibida na condução", () => {
    for (const [preset, cfg] of Object.entries(PRESET_TOOLS)) {
      const proibidas = cfg.mcp.filter((id) => NUNCA_NA_CONDUCAO.has(id));
      expect(proibidas, preset).toEqual([]);
      const obrigatoriasProibidas = cfg.obrigatorias.flat().filter((id) => NUNCA_NA_CONDUCAO.has(id));
      expect(obrigatoriasProibidas, preset).toEqual([]);
    }
    for (const id of TOOLS_DO_ENGINE_NA_CONDUCAO) expect(NUNCA_NA_CONDUCAO.has(id), id).toBe(false);
  });

  it("todo id MCP citado existe no catálogo (nome errado seria ferramenta que some calada)", () => {
    const citados = new Set<string>();
    for (const cfg of Object.values(PRESET_TOOLS)) {
      for (const id of cfg.mcp) citados.add(id);
      for (const id of cfg.obrigatorias.flat()) citados.add(id);
    }
    for (const id of NUNCA_NA_CONDUCAO) if (id.startsWith("crm_")) citados.add(id);
    const inexistentes = [...citados].filter((id) => !NOMES_DO_CATALOGO.has(id));
    expect(inexistentes).toEqual([]);
  });

  it("toda obrigatória está na lista liberada do próprio preset", () => {
    for (const [preset, cfg] of Object.entries(PRESET_TOOLS)) {
      const fora = cfg.obrigatorias.flat().filter((id) => !cfg.mcp.includes(id));
      expect(fora, preset).toEqual([]);
    }
  });

  it("as tools do motor citadas existem no turno", () => {
    const motor = [...TOOLS_DO_ENGINE_NA_CONDUCAO, "schedule_followup", "send_template", "open_human_case", "provide_case_update"];
    expect(motor.filter((n) => !temToolDoMotor(n))).toEqual([]);
    // controle: o leitor do fonte não aceita qualquer nome
    expect(temToolDoMotor("tool_que_nao_existe")).toBe(false);
  });
});

describe("ferramentasPermitidas (ponto 1)", () => {
  it("é interseção: agente sem agenda não ganha agenda no preset de agendar", () => {
    expect(ferramentasPermitidas("agendar_reuniao", ["crm_move_lead_stage", "crm_get_lead"])).toEqual([
      "crm_move_lead_stage",
      "crm_get_lead",
    ]);
  });

  it("corta o que o preset não libera e o que é proibido", () => {
    const doAgente = ["crm_list_leads", "crm_assign_conversation", "crm_search_products", "crm_move_lead_stage"];
    expect(ferramentasPermitidas("qualificar", doAgente)).toEqual(["crm_move_lead_stage"]);
    expect(ferramentasPermitidas("vender", doAgente)).toEqual(["crm_search_products", "crm_move_lead_stage"]);
  });
});

describe("filtrarRawTools (ponto 2)", () => {
  const raw = Object.fromEntries(
    [
      "send_message",
      "request_human_handoff",
      "get_lead_context",
      "schedule_followup",
      "send_template",
      "open_human_case",
      "provide_case_update",
      "crm_move_lead_stage",
      "crm_book_appointment",
      "crm_list_leads",
      "crm_enroll_followup_flow",
    ].map((n) => [n, { nome: n }]),
  );

  it("mantém as tools do motor liberadas e as do preset; tira as proibidas", () => {
    const final = Object.keys(filtrarRawTools(raw, "agendar_visita")).sort();
    expect(final).toEqual(
      ["crm_book_appointment", "crm_move_lead_stage", "get_lead_context", "request_human_handoff", "send_message"].sort(),
    );
  });

  it("agenda não entra no preset de qualificar", () => {
    expect(Object.keys(filtrarRawTools(raw, "qualificar"))).not.toContain("crm_book_appointment");
  });
});

describe("obrigatórias do objetivo", () => {
  it("agendar: basta uma das ferramentas de marcar, mais mover etapa", () => {
    expect(obrigatoriasFaltando("agendar_reuniao", ["crm_move_lead_stage", "crm_book_appointment"])).toEqual([]);
    expect(obrigatoriasFaltando("agendar_reuniao", ["crm_move_lead_stage", "crm_find_and_book_appointment"])).toEqual([]);
    expect(obrigatoriasFaltando("agendar_reuniao", ["crm_move_lead_stage"])).toHaveLength(1);
  });
  it("qualificar sem mover etapa não alcança o objetivo", () => {
    expect(obrigatoriasFaltando("qualificar", ["crm_get_lead"])).toEqual([["crm_move_lead_stage"]]);
  });
});

describe("bloco do objetivo", () => {
  it("termina com o fecho fixo; o assistido ganha a linha da revisão", () => {
    const auto = blocoDoObjetivo("vender", "automatico");
    const assist = blocoDoObjetivo("vender", "assistido");
    expect(auto).toContain("crm_move_lead_stage");
    expect(auto).not.toContain("revisada por uma pessoa");
    expect(assist).toContain("revisada por uma pessoa");
  });
  it("sem travessão nos textos", () => {
    for (const p of PRESETS_DA_CONDUCAO) expect(blocoDoObjetivo(p, "assistido")).not.toMatch(/—/);
  });
});
