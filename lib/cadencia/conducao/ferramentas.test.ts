import { describe, expect, it, vi } from "vitest";

import { RECUSA_FORA_DA_CONDUCAO, restringirAConducao } from "./ferramentas";
import { filtrarRawTools } from "./presets";

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
