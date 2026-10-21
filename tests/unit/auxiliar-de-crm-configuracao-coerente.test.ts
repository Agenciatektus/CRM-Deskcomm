import { describe, expect, it } from "vitest";

import {
  FERRAMENTAS_QUE_FALAM,
  versionCreateSchema,
  versionPatchSchema,
} from "@/lib/ai/agents/validation";
import { IDS_DO_HARNESS } from "@/lib/mcp/tools/ferramentas-do-harness";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalogo";

/**
 * A CONFERÊNCIA QUE NÃO PODE TER PORTA DOS FUNDOS (9060).
 *
 * Quem impede a fala é o veto da cadeia de envio. Isto aqui é defesa em
 * profundidade: impede que a configuração se contradiga — "não fala com o
 * cliente" ligado ao lado da capacidade de mandar mensagem.
 *
 * O caminho que a revisão encontrou: criar o rascunho COM a capacidade e a
 * marca desligada (passa), ligar a marca por PATCH, publicar. A conferência
 * existia e nunca via o estado final.
 */
describe("auxiliar de CRM: configuração coerente", () => {
  const base = {
    system_prompt: "voce organiza o CRM da loja e nao fala com o cliente",
    provider: "openai" as const,
    model: "gpt-6-luna",
    credential_id: "55555555-5555-4555-8555-555555555555",
    channel_session_id: "44444444-4444-4444-8444-444444444444",
  };

  it("⭐ criação: marca ligada + capacidade de envio é recusada", () => {
    const r = versionCreateSchema.safeParse({
      ...base,
      somente_interno: true,
      tool_ids: ["crm_get_lead", "crm_start_conversation_and_send"],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const issue = r.error.issues.find((i) => i.path.join(".") === "tool_ids");
    expect(issue?.message).toContain("auxiliar de CRM");
    // A mensagem diz as DUAS saídas, porque quem lê precisa escolher uma.
    expect(issue?.message).toContain("crm_start_conversation_and_send");
    expect(issue?.message).toContain("tire a marca");
  });

  it("⭐ PATCH: ligar a marca depois, com a capacidade já lá, também é recusado", () => {
    const r = versionPatchSchema.safeParse({
      somente_interno: true,
      tool_ids: ["crm_send_whatsapp_message"],
    });
    expect(r.success).toBe(false);
  });

  it("CONTROLE — sem a marca, a mesma capacidade passa (ela é legítima para quem fala)", () => {
    expect(
      versionCreateSchema.safeParse({
        ...base,
        somente_interno: false,
        tool_ids: ["crm_start_conversation_and_send"],
      }).success,
    ).toBe(true);
  });

  it("CONTROLE — com a marca e só capacidades de organizar, passa", () => {
    expect(
      versionCreateSchema.safeParse({
        ...base,
        somente_interno: true,
        tool_ids: ["crm_get_lead", "crm_update_lead", "crm_move_lead_stage"],
      }).success,
    ).toBe(true);
  });

  it("CONTROLE — PATCH que não fala da marca não opina sobre as capacidades", () => {
    // `.partial()`: campo ausente é `undefined`. A conferência só recusa quando
    // a marca chega como `true` na MESMA gravação de uma capacidade de envio.
    expect(versionPatchSchema.safeParse({ tool_ids: ["crm_send_whatsapp_message"] }).success).toBe(
      true,
    );
  });

  /**
   * A lista não pode envelhecer em silêncio: uma capacidade de envio nova entra
   * no catálogo e `FERRAMENTAS_QUE_FALAM` deixa de ser completa sem ninguém ver.
   * Esta cerca não adivinha o futuro — ela prende o presente e obriga quem
   * acrescentar a próxima a passar por aqui.
   */
  it("toda ferramenta conhecida que entrega mensagem está na lista ou no harness", () => {
    const entregamMensagem = TOOL_CATALOG.map((t) => t.name).filter((id) =>
      id.includes("send"),
    );
    for (const id of entregamMensagem) {
      expect(
        FERRAMENTAS_QUE_FALAM.includes(id) || IDS_DO_HARNESS.has(id),
        `${id} entrega mensagem e não está em FERRAMENTAS_QUE_FALAM nem em IDS_DO_HARNESS`,
      ).toBe(true);
    }
    // E a própria busca precisa estar achando alguma coisa: zero aqui seria
    // uma cerca que passa porque não mediu nada.
    expect(entregamMensagem.length).toBeGreaterThan(0);
  });
});
