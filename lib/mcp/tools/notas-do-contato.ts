/**
 * Notas do cliente que o agente lê e escreve: `crm_add_lead_note` e `crm_list_lead_notes`.
 *
 * Mesma tabela (`lead_notes`, chaveada por contato) que o motor nativo grava com `save_lead_note` e
 * que o painel do contato mostra: aquela ferramenta é do motor e não aparece na tela de capacidades,
 * então estas duas são a porta SELECIONÁVEL. Durante um turno o alvo é sempre o contato da conversa
 * (`ctx.contatoDoTurno`); a escrita também passa pela tabela de escopo de `escopo-das-escritas.ts`.
 */
import { z } from "zod";

import { estimateIndexTokens } from "@/lib/agent-engine/agent/lead-notes";
import type { McpContext, McpToolDefinition } from "@/lib/mcp/types";

const FORA_DA_CONVERSA = {
  permitido: false,
  motivo: "fora_da_conversa",
  mensagem:
    "esta conversa é com outra pessoa — as notas de quem não é este cliente não são suas para " +
    "ler nem escrever; siga a conversa com quem está falando.",
} as const;

const SEM_CLIENTE = {
  permitido: false,
  motivo: "cliente_nao_encontrado",
  mensagem: "informe o contact_id de um cliente que exista nesta organização.",
} as const;

/** Contato alvo: o do turno quando há turno (id diferente é recusado); senão o informado, se existir na org. */
async function alvoDaNota(
  ctx: McpContext,
  informado: string | undefined,
): Promise<{ contactId: string } | { recusa: Record<string, unknown> }> {
  const doTurno = ctx.contatoDoTurno;
  if (doTurno) {
    return informado !== undefined && informado !== doTurno
      ? { recusa: FORA_DA_CONVERSA }
      : { contactId: doTurno };
  }
  if (!informado) return { recusa: SEM_CLIENTE };
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("id", informado)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { contactId: informado } : { recusa: SEM_CLIENTE };
}

const adicionarShape = {
  contact_id: z.string().uuid().optional(),
  headline: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
};

export const crmAddLeadNote: McpToolDefinition<typeof adicionarShape> = {
  name: "crm_add_lead_note",
  description:
    "Registra uma nota sobre o cliente da conversa, para você e a equipe lembrarem depois: preferência, " +
    "combinado, observação técnica do atendimento. `headline` é a linha curta que aparece na lista; " +
    "`body` é o texto completo. Em conversa de atendimento o cliente é sempre o desta conversa. " +
    "Grave só o que o cliente disse ou o que foi combinado, e só o necessário: dado de saúde ou " +
    "alergia apenas se a própria cliente informou, nas palavras dela. Nunca grave senha, documento ou " +
    "dado de cartão. Antes de gravar, consulte `crm_list_lead_notes` para não repetir uma nota que já existe.",
  inputSchema: adicionarShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const alvo = await alvoDaNota(ctx, input.contact_id);
    if ("recusa" in alvo) return alvo.recusa;
    // Mesmo orçamento do índice que o `save_lead_note` nativo respeita: o índice vai inteiro ao prompt.
    const { data: atuais, error: eIdx } = await ctx.supabase
      .from("lead_notes")
      .select("id, headline")
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", alvo.contactId);
    if (eIdx) throw new Error(eIdx.message);
    const orcamento = Number(process.env.LEAD_NOTES_INDEX_MAX_TOKENS) || 500;
    const indice = [
      ...((atuais ?? []) as Array<{ id: string; headline: string }>),
      // id de uuid (36) para a conta bater com o render real
      { id: "00000000-0000-0000-0000-000000000000", headline: input.headline },
    ];
    if (estimateIndexTokens(indice) > orcamento) {
      return {
        registrada: false,
        motivo: "indice_de_notas_cheio",
        mensagem:
          "as notas deste cliente já ocupam todo o espaço reservado a elas. Não grave esta; se for essencial, " +
          "avise a equipe para consolidar as notas antigas.",
      };
    }
    const { data, error } = await ctx.supabase
      .from("lead_notes")
      .insert({
        organization_id: ctx.organizationId,
        contact_id: alvo.contactId,
        headline: input.headline,
        body: input.body,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { registrada: true, nota_id: (data as { id: string }).id, contact_id: alvo.contactId };
  },
};

const listarShape = {
  contact_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
};

export const crmListLeadNotes: McpToolDefinition<typeof listarShape> = {
  name: "crm_list_lead_notes",
  description:
    "Lista as notas já registradas sobre o cliente (a mais nova primeiro), com o texto completo. " +
    "Em conversa de atendimento, lista apenas as notas do cliente desta conversa. Use antes de " +
    "registrar uma nota nova e quando precisar lembrar o que ficou combinado.",
  inputSchema: listarShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const alvo = await alvoDaNota(ctx, input.contact_id);
    if ("recusa" in alvo) return alvo.recusa;
    const { data, error } = await ctx.supabase
      .from("lead_notes")
      .select("id, headline, body, created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", alvo.contactId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (error) throw new Error(error.message);
    return { contact_id: alvo.contactId, notas: data ?? [] };
  },
};
