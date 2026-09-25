import { describe, expect, it } from "vitest";

import type { FlowGraph } from "@/lib/followup/graph-schema";
import { CADENCE_SETTINGS_PADRAO } from "../settings";
import { validarPublicacaoDaCadencia } from "../validar-publicacao";
import { avaliarConducao, validarConducaoDaCadencia, validarConducaoDoRascunho, type DadosDaConducao } from "./validar";
import type { ConducaoPorIa } from "./settings";

const FUNIL = "11111111-1111-4111-8111-111111111111";
const OUTRO_FUNIL = "22222222-2222-4222-8222-222222222222";
const ETAPA_GATILHO = "33333333-3333-4333-8333-333333333333";
const ETAPA_ALVO = "44444444-4444-4444-8444-444444444444";
const AGENTE = "55555555-5555-4555-8555-555555555555";
const VERSAO = "66666666-6666-4666-8666-666666666666";

const conducao: ConducaoPorIa = {
  quem_atende: "ia",
  agent_id: AGENTE,
  preset: "agendar_reuniao",
  etapa_alvo_id: ETAPA_ALVO,
  modo: "automatico",
};

const dadosOk: DadosDaConducao = {
  iaLigada: true,
  agente: { archived_at: null, operation_mode: "automatic", published_version_id: VERSAO },
  versao: {
    agent_id: AGENTE,
    status: "published",
    tool_ids: ["crm_move_lead_stage", "crm_find_and_book_appointment", "crm_find_free_slots"],
    pipeline_ids: [FUNIL],
  },
  etapaAlvo: { pipeline_id: FUNIL, is_lost: false, is_archived: false },
  orcamento: { enforcement_mode: "bloquear", monthly_limit_cents: 5000, enforcement_effective_at: "2026-09-01T00:00:00Z" },
};
const ctx = { pipelineId: FUNIL, etapaDoGatilho: ETAPA_GATILHO };
const codigos = (c: ConducaoPorIa, d: DadosDaConducao, x = ctx) => avaliarConducao(c, x, d).map((e) => e.code);

describe("avaliarConducao (regra pura)", () => {
  it("controle: tudo em ordem publica sem erro (sem exigir template de disclosure)", () => {
    expect(codigos(conducao, dadosOk)).toEqual([]);
  });

  it("flag da organização desligada", () => {
    expect(codigos(conducao, { ...dadosOk, iaLigada: false })).toEqual(["cadencia_ia_desligada"]);
  });

  it("agente inexistente, arquivado, sem versão publicada ou versão de outro agente", () => {
    expect(codigos(conducao, { ...dadosOk, agente: null })).toContain("cadencia_agente_invalido");
    expect(codigos(conducao, { ...dadosOk, agente: { ...dadosOk.agente!, archived_at: "2026-09-01" } })).toContain(
      "cadencia_agente_invalido",
    );
    expect(codigos(conducao, { ...dadosOk, versao: { ...dadosOk.versao!, status: "superseded" } })).toContain(
      "cadencia_agente_invalido",
    );
    expect(codigos(conducao, { ...dadosOk, versao: { ...dadosOk.versao!, agent_id: VERSAO } })).toContain(
      "cadencia_agente_invalido",
    );
  });

  it("⭐ automático com agente assistido é recusado; assistido com o mesmo agente passa", () => {
    const assistido = { ...dadosOk, agente: { ...dadosOk.agente!, operation_mode: "assisted" } };
    expect(codigos(conducao, assistido)).toEqual(["cadencia_agente_assistido_exige_modo_assistido"]);
    expect(codigos({ ...conducao, modo: "assistido" }, assistido)).toEqual([]);
  });

  it("agente sem permissão no funil da cadência", () => {
    expect(codigos(conducao, { ...dadosOk, versao: { ...dadosOk.versao!, pipeline_ids: [OUTRO_FUNIL] } })).toEqual([
      "cadencia_agente_fora_do_funil",
    ]);
  });

  it("agente sem as ferramentas do objetivo", () => {
    const semMarcar = { ...dadosOk, versao: { ...dadosOk.versao!, tool_ids: ["crm_move_lead_stage"] } };
    expect(codigos(conducao, semMarcar)).toEqual(["cadencia_agente_sem_ferramentas_do_objetivo"]);
    // controle: o mesmo agente serve para qualificar
    expect(codigos({ ...conducao, preset: "qualificar" }, semMarcar)).toEqual([]);
  });

  it("etapa-alvo: de outro funil, arquivada, de perda, inexistente ou igual à do gatilho", () => {
    const e = dadosOk.etapaAlvo!;
    for (const etapaAlvo of [
      { ...e, pipeline_id: OUTRO_FUNIL },
      { ...e, is_archived: true },
      { ...e, is_lost: true },
      null,
    ]) {
      expect(codigos(conducao, { ...dadosOk, etapaAlvo })).toEqual(["cadencia_etapa_alvo_invalida"]);
    }
    expect(codigos(conducao, dadosOk, { pipelineId: FUNIL, etapaDoGatilho: ETAPA_ALVO })).toEqual([
      "cadencia_etapa_alvo_invalida",
    ]);
  });

  it("orçamento de IA precisa estar em bloquear, acima do piso e com data de vigência", () => {
    const o = dadosOk.orcamento!;
    for (const orcamento of [
      null,
      { ...o, enforcement_mode: "avisar" },
      { ...o, monthly_limit_cents: 50 },
      { ...o, enforcement_effective_at: null },
    ]) {
      expect(codigos(conducao, { ...dadosOk, orcamento })).toEqual(["cadencia_orcamento_de_ia"]);
    }
  });
});

/** Dublê do Supabase por tabela (filtros ignorados), como em validar-publicacao.test.ts. */
function adminFalso(tabelas: Record<string, Array<Record<string, unknown>>>) {
  const lidas: string[] = [];
  const admin = {
    from(tabela: string) {
      lidas.push(tabela);
      const linhas = tabelas[tabela] ?? [];
      const q = {
        select: () => q,
        eq: () => q,
        in: () => Promise.resolve({ data: linhas, error: null }),
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
      };
      return q;
    },
  };
  return { admin: admin as never, lidas };
}

const bancoOk = {
  organizations: [{ settings: { cadencia_ia: true } }],
  ai_agents: [{ archived_at: null, operation_mode: "automatic", published_version_id: VERSAO }],
  ai_agent_versions: [dadosOk.versao!],
  crm_stages: [{ id: ETAPA_ALVO, pipeline_id: FUNIL, is_lost: false, is_archived: false }],
  ai_budgets: [dadosOk.orcamento!],
  channel_sessions: [{ id: "sessao-1", status: "WORKING", archived_at: null }],
};

const politica = { ...CADENCE_SETTINGS_PADRAO, legal_basis_ref: "LIA teste" };
const pointerComIa = {
  pipeline_id: FUNIL,
  channel_session_id: "sessao-1",
  cadence_settings: { ...politica, conducao },
  trigger_config: { kind: "manual" },
};

describe("validarConducaoDaCadencia (com o banco)", () => {
  it("atendente não lê nada e não exige nada", async () => {
    const { admin, lidas } = adminFalso({});
    expect(await validarConducaoDaCadencia(admin, "org", { ...pointerComIa, cadence_settings: politica })).toEqual([]);
    expect(lidas).toEqual([]);
  });

  it("condução gravada ilegível é recusada com mensagem própria", async () => {
    const { admin } = adminFalso(bancoOk);
    const erros = await validarConducaoDaCadencia(admin, "org", {
      ...pointerComIa,
      cadence_settings: { ...politica, conducao: { quem_atende: "ia" } },
    });
    expect(erros.map((e) => e.code)).toEqual(["cadencia_conducao_invalida"]);
  });

  it("controle: IA em ordem passa, sem ler template de disclosure", async () => {
    const { admin, lidas } = adminFalso(bancoOk);
    expect(await validarConducaoDaCadencia(admin, "org", pointerComIa)).toEqual([]);
    expect(lidas).not.toContain("disclosure_template_pointers");
  });

  it("flag desligada no banco é recusada", async () => {
    const { admin } = adminFalso({ ...bancoOk, organizations: [{ settings: {} }] });
    expect((await validarConducaoDaCadencia(admin, "org", pointerComIa)).map((e) => e.code)).toEqual([
      "cadencia_ia_desligada",
    ]);
  });
});

describe("publicação da cadência com IA", () => {
  const grafo: FlowGraph = {
    nodes: [
      { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
      { id: "m", type: "action", label: "Msg", position: { x: 0, y: 1 }, config: { mode: "text", body: "Oi" } },
      { id: "f", type: "end", label: "Fim", position: { x: 0, y: 9 }, config: { outcome: "exhausted" } },
    ],
    edges: [],
  };

  it("IA sem template de disclosure publica", async () => {
    const { admin } = adminFalso(bancoOk);
    expect(await validarPublicacaoDaCadencia(admin, "org", pointerComIa, grafo)).toEqual([]);
  });

  it("automático com agente assistido é recusado na publicação", async () => {
    const { admin } = adminFalso({
      ...bancoOk,
      ai_agents: [{ archived_at: null, operation_mode: "assisted", published_version_id: VERSAO }],
    });
    const erros = await validarPublicacaoDaCadencia(admin, "org", pointerComIa, grafo);
    expect(erros.map((e) => e.code)).toEqual(["cadencia_agente_assistido_exige_modo_assistido"]);
  });
});

describe("validarConducaoDoRascunho (PATCH)", () => {
  it("controle: etapa do funil e agente da organização", async () => {
    const { admin } = adminFalso(bancoOk);
    expect(await validarConducaoDoRascunho(admin, "org", FUNIL, conducao, ETAPA_GATILHO)).toBeNull();
  });
  it("etapa de outro funil, de perda, a do gatilho, ou agente inexistente", async () => {
    const outro = adminFalso({ ...bancoOk, crm_stages: [{ pipeline_id: OUTRO_FUNIL, is_lost: false, is_archived: false }] });
    expect(await validarConducaoDoRascunho(outro.admin, "org", FUNIL, conducao, null)).toMatch(/não é deste funil/);
    const perda = adminFalso({ ...bancoOk, crm_stages: [{ pipeline_id: FUNIL, is_lost: true, is_archived: false }] });
    expect(await validarConducaoDoRascunho(perda.admin, "org", FUNIL, conducao, null)).toMatch(/perda/);
    const { admin } = adminFalso(bancoOk);
    expect(await validarConducaoDoRascunho(admin, "org", FUNIL, conducao, ETAPA_ALVO)).toMatch(/dispara/);
    const semAgente = adminFalso({ ...bancoOk, ai_agents: [] });
    expect(await validarConducaoDoRascunho(semAgente.admin, "org", FUNIL, conducao, null)).toMatch(/agente/);
  });
});
