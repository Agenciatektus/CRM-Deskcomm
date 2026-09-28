import { describe, expect, it, vi } from "vitest";

import { CHAVES_CONFERIDAS, RECUSA_FORA_DA_CONDUCAO, restringirAConducao } from "./ferramentas";
import { filtrarRawTools, PRESET_TOOLS } from "./presets";

const ALVO = { leadId: "lead-1", contactId: "ct-1", conversationId: "cv-1" };

function ferramenta() {
  const execute = vi.fn(async (_args: unknown, _opts?: unknown) => ({ ok: true }));
  return { tool: { description: "x", execute }, execute };
}

describe("restringirAConducao — anti-IDOR", () => {
  it.each([
    ["lead_id", { lead_id: "lead-2" }],
    ["contact_id", { contact_id: "ct-2" }],
    ["conversation_id", { conversation_id: "cv-2" }],
  ])("recusa %s alheio (leitura e escrita) sem executar", async (_n, args) => {
    const leitura = ferramenta();
    const escrita = ferramenta();
    const t = restringirAConducao({ crm_get_lead: leitura.tool, crm_move_lead_stage: escrita.tool }, ALVO);
    await expect(t.crm_get_lead!.execute!(args as never, undefined as never)).resolves.toEqual(RECUSA_FORA_DA_CONDUCAO);
    await expect(t.crm_move_lead_stage!.execute!(args as never, undefined as never)).resolves.toEqual(
      RECUSA_FORA_DA_CONDUCAO,
    );
    expect(leitura.execute).not.toHaveBeenCalled();
    expect(escrita.execute).not.toHaveBeenCalled();
  });

  it("deixa passar os ids da própria condução e chamadas sem id (controle positivo)", async () => {
    const f = ferramenta();
    const t = restringirAConducao({ crm_update_lead: f.tool }, ALVO);
    await t.crm_update_lead!.execute!({ lead_id: "lead-1", contact_id: "ct-1", conversation_id: "cv-1" } as never, {} as never);
    await t.crm_update_lead!.execute!({ title: "x" } as never, {} as never);
    expect(f.execute).toHaveBeenCalledTimes(2);
  });

  it("appointment_id: só o do contato da condução; sem verificador, recusa", async () => {
    const f = ferramenta();
    const semVerificador = restringirAConducao({ crm_reschedule_appointment: f.tool }, ALVO);
    await expect(
      semVerificador.crm_reschedule_appointment!.execute!({ appointment_id: "ap-1" } as never, {} as never),
    ).resolves.toEqual(RECUSA_FORA_DA_CONDUCAO);

    const comVerificador = restringirAConducao(
      { crm_reschedule_appointment: f.tool },
      { ...ALVO, agendamentoEhDaConducao: async (id) => id === "ap-meu" },
    );
    await expect(
      comVerificador.crm_reschedule_appointment!.execute!({ appointment_id: "ap-outro" } as never, {} as never),
    ).resolves.toEqual(RECUSA_FORA_DA_CONDUCAO);
    await comVerificador.crm_reschedule_appointment!.execute!({ appointment_id: "ap-meu" } as never, {} as never);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it("condução sem negócio: qualquer lead_id é recusado", async () => {
    const f = ferramenta();
    const t = restringirAConducao({ crm_get_lead: f.tool }, { ...ALVO, leadId: null });
    await expect(t.crm_get_lead!.execute!({ lead_id: "lead-1" } as never, {} as never)).resolves.toEqual(
      RECUSA_FORA_DA_CONDUCAO,
    );
  });

  it("composto com filtrarRawTools: o que o preset não lista some, o resto fica embrulhado", async () => {
    const tools = {
      send_message: ferramenta().tool,
      schedule_followup: ferramenta().tool,
      crm_list_leads: ferramenta().tool,
      crm_move_lead_stage: ferramenta().tool,
      crm_find_free_slots: ferramenta().tool,
    };
    const final = restringirAConducao(filtrarRawTools(tools, "qualificar"), ALVO);
    expect(Object.keys(final).sort()).toEqual(["crm_move_lead_stage", "send_message"]);
  });
});

describe("par polimórfico target_kind/target_id (crm_manage_tags)", () => {
  it.each([
    ["lead", "lead-1"],
    ["contact", "ct-1"],
    ["conversation", "cv-1"],
  ])("%s da própria condução passa", async (kind, id) => {
    const f = ferramenta();
    const t = restringirAConducao({ crm_manage_tags: f.tool }, ALVO);
    await t.crm_manage_tags!.execute!({ target_kind: kind, target_id: id, add: ["x"] } as never, {} as never);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["lead", "lead-2"],
    ["contact", "ct-2"],
    ["conversation", "cv-2"],
    ["lead", "ct-1"],
    ["organization", "lead-1"],
    [undefined, "lead-1"],
  ])("kind=%s id=%s é recusado", async (kind, id) => {
    const f = ferramenta();
    const t = restringirAConducao({ crm_manage_tags: f.tool }, ALVO);
    await expect(
      t.crm_manage_tags!.execute!({ target_kind: kind, target_id: id, add: ["x"] } as never, {} as never),
    ).resolves.toEqual(RECUSA_FORA_DA_CONDUCAO);
    expect(f.execute).not.toHaveBeenCalled();
  });
});

describe("crm_list_appointments só com o contato da condução", () => {
  it("sem contact_id (agenda do dia da equipe) → recusa; com outro → recusa; com o da condução → passa", async () => {
    const f = ferramenta();
    const t = restringirAConducao({ crm_list_appointments: f.tool }, ALVO);
    await expect(t.crm_list_appointments!.execute!({ dia: "2026-09-28" } as never, {} as never)).resolves.toEqual(
      RECUSA_FORA_DA_CONDUCAO,
    );
    await expect(t.crm_list_appointments!.execute!({ contact_id: "ct-2" } as never, {} as never)).resolves.toEqual(
      RECUSA_FORA_DA_CONDUCAO,
    );
    await t.crm_list_appointments!.execute!({ contact_id: "ct-1", dia: "2026-09-28" } as never, {} as never);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
});

/**
 * COBERTURA: toda chave de id de toda ferramenta dos presets ou é conferida
 * pelo wrapper, ou está declarada aqui como id que NÃO aponta para pessoa,
 * negócio, conversa ou compromisso. Ferramenta nova no preset com chave nova
 * reprova até alguém decidir de que lado ela fica.
 */
const IDS_QUE_NAO_SAO_DE_PESSOA: Record<string, string> = {
  to_stage_id: "etapa de destino do funil (configuração); o escopo de funil restringe ao da cadência",
  owner_agent_id: "responsável da equipe pelo negócio, não o cliente",
  owner_user_id: "atendente da equipe; crm_list_appointments exige o contact_id da condução",
  pipeline_id: "funil (configuração); o escopo de funil do agente já restringe ao da cadência",
};

describe("cobertura do anti-IDOR sobre o inputSchema das ferramentas dos presets", () => {
  it("toda chave *_id / target_kind está coberta ou declarada", async () => {
    const { getToolByName } = await import("@/lib/mcp/tools");
    const nomes = [...new Set(Object.values(PRESET_TOOLS).flatMap((p) => [...p.mcp]))];
    expect(nomes.length, "controle: os presets listam ferramentas").toBeGreaterThan(5);
    const conferidas = new Set<string>([...CHAVES_CONFERIDAS, "target_kind"]);
    const soltas: string[] = [];
    const usadas = new Set<string>();
    let vistas = 0;
    for (const nome of nomes) {
      const tool = getToolByName(nome);
      expect(tool, `ferramenta do preset fora do registro: ${nome}`).toBeDefined();
      for (const chave of Object.keys((tool!.inputSchema ?? {}) as Record<string, unknown>)) {
        if (!chave.endsWith("_id") && chave !== "target_kind") continue;
        vistas++;
        usadas.add(chave);
        if (!conferidas.has(chave) && IDS_QUE_NAO_SAO_DE_PESSOA[chave] === undefined) soltas.push(`${nome}.${chave}`);
      }
    }
    expect(vistas, "controle positivo: a varredura enxerga chaves de id").toBeGreaterThan(3);
    expect(soltas).toEqual([]);
    // A declaração não sobrevive à chave que a motivou.
    expect(Object.keys(IDS_QUE_NAO_SAO_DE_PESSOA).filter((k) => !usadas.has(k))).toEqual([]);
  });
});
