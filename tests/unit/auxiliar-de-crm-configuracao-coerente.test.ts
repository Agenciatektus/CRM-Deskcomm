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
/** As que ENCOMENDAM fala para depois — recusadas ao auxiliar em `mcp-tools.ts`. */
const ENCOMENDAM_FALA = ["crm_enroll_followup_flow", "crm_schedule_followup"];
/** As que o nome sugere mas que só leem, e por isso não precisam de trava. */
const SO_CONSULTAM = ["crm_list_followups", "crm_cancel_followup"];

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

  it("PATCH que não fala da marca passa — e por isso a publicação confere depois", () => {
    // `.partial()`: campo ausente é `undefined`, então esta gravação sozinha não
    // tem como ser contraditória e passa mesmo.
    //
    // ⚠️ Este caso NÃO é um atestado de que está tudo bem: ele é metade de uma
    // porta dos fundos encontrada na revisão — gravar a capacidade num PATCH,
    // ligar a marca em outro, e publicar sem ninguém ver o estado final. A outra
    // metade está fechada em `publishAgentVersion`, e é lá que o caso irmão
    // deste mora. Se um dia esta linha ficar sozinha, a porta volta.
    expect(versionPatchSchema.safeParse({ tool_ids: ["crm_send_whatsapp_message"] }).success).toBe(
      true,
    );
  });

  it("⭐ a publicação recusa a contradição montada em duas gravações", async () => {
    const { publishAgentVersion } = await import("@/lib/ai/agents/publish");
    // O mínimo que a função lê antes de conferir: a linha da versão.
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    provider: "openai",
                    credential_id: "55555555-5555-4555-8555-555555555555",
                    handoff_legal_enabled: false,
                    somente_interno: true,
                    tool_ids: ["crm_get_lead", "crm_send_whatsapp_message"],
                  },
                  error: null,
                }),
                single: async () => ({
                  data: {
                    provider: "openai",
                    credential_id: "55555555-5555-4555-8555-555555555555",
                    handoff_legal_enabled: false,
                    somente_interno: true,
                    tool_ids: ["crm_get_lead", "crm_send_whatsapp_message"],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const r = await publishAgentVersion(admin as never, {
      orgId: "11111111-1111-4111-8111-111111111111",
      agentId: "22222222-2222-4222-8222-222222222222",
      versionId: "33333333-3333-4333-8333-333333333333",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("auxiliar_de_crm_com_envio");
    expect(r.message).toContain("crm_send_whatsapp_message");
  });

  /**
   * A lista não pode envelhecer em silêncio: uma capacidade de envio nova entra
   * no catálogo e `FERRAMENTAS_QUE_FALAM` deixa de ser completa sem ninguém ver.
   * Esta cerca não adivinha o futuro — ela prende o presente e obriga quem
   * acrescentar a próxima a passar por aqui.
   */
  it("toda ferramenta conhecida que entrega mensagem está na lista ou no harness", () => {
    const entregamMensagem = TOOL_CATALOG.map((t) => t.name).filter(
      (id) => id.includes("send") || id.includes("followup"),
    );
    for (const id of entregamMensagem) {
      expect(
        FERRAMENTAS_QUE_FALAM.includes(id) ||
          IDS_DO_HARNESS.has(id) ||
          ENCOMENDAM_FALA.includes(id) ||
          SO_CONSULTAM.includes(id),
        `${id} pode chegar ao cliente e não está em nenhuma das listas que o auxiliar de CRM respeita`,
      ).toBe(true);
    }
    // E a própria busca precisa estar achando alguma coisa: zero aqui seria
    // uma cerca que passa porque não mediu nada.
    expect(entregamMensagem.length).toBeGreaterThan(0);
  });
});
