/**
 * ANTI-IDOR DA CONDUÇÃO — uma conversa aberta pela cadência só mexe no negócio dela.
 *
 * A allowlist por preset (`presets.ts`) decide QUAIS ferramentas a IA recebe; este
 * wrapper decide SOBRE QUEM elas agem. Toda ferramenta que aceita `lead_id`,
 * `contact_id` ou `conversation_id` é recusada quando o valor não é o da condução
 * — em LEITURA também: ver o negócio de outra pessoa já é vazamento, e o modelo
 * pode ter lido um id de outro lead numa mensagem manipulada. `appointment_id` é
 * conferido no banco (o compromisso tem de ser do contato da condução).
 *
 * Chamada sem nenhum desses campos passa: as ferramentas do motor agem sobre o
 * lead do job por construção, e as de agenda sem id (listar horários livres) não
 * alcançam ninguém.
 */

export interface AlvoDaConducao {
  leadId: string | null;
  contactId: string;
  conversationId: string;
  /** Confere se o compromisso é do contato da condução. Ausente = recusa todo `appointment_id`. */
  agendamentoEhDaConducao?: (appointmentId: string) => Promise<boolean>;
}

export const RECUSA_FORA_DA_CONDUCAO = {
  ok: false,
  error: {
    code: "fora_da_conducao",
    message: "Esta conversa só pode consultar e alterar o negócio da própria pessoa.",
  },
} as const;

type ComExecute = { execute?: (...args: never[]) => unknown };

function valor(args: unknown, chave: string): unknown {
  if (args === null || typeof args !== "object") return undefined;
  return (args as Record<string, unknown>)[chave];
}

/** `true` quando a chamada aponta para alguém que não é o da condução. */
export async function apontaParaOutro(args: unknown, alvo: AlvoDaConducao): Promise<boolean> {
  const lead = valor(args, "lead_id");
  if (lead !== undefined && lead !== null && lead !== alvo.leadId) return true;
  const contato = valor(args, "contact_id");
  if (contato !== undefined && contato !== null && contato !== alvo.contactId) return true;
  const conversa = valor(args, "conversation_id");
  if (conversa !== undefined && conversa !== null && conversa !== alvo.conversationId) return true;
  const agendamento = valor(args, "appointment_id");
  if (agendamento !== undefined && agendamento !== null) {
    if (typeof agendamento !== "string" || alvo.agendamentoEhDaConducao === undefined) return true;
    if (!(await alvo.agendamentoEhDaConducao(agendamento))) return true;
  }
  return false;
}

/**
 * Embrulha o `execute` de cada ferramenta. Ferramenta sem `execute` (só
 * declarada) passa intacta — não há o que executar.
 */
export function restringirAConducao<T extends ComExecute>(
  tools: Readonly<Record<string, T>>,
  alvo: AlvoDaConducao,
): Record<string, T> {
  const saida: Record<string, T> = {};
  for (const [nome, tool] of Object.entries(tools)) {
    const original = tool.execute;
    if (typeof original !== "function") {
      saida[nome] = tool;
      continue;
    }
    const executar = original.bind(tool) as (...a: unknown[]) => unknown;
    saida[nome] = {
      ...tool,
      execute: (async (...a: unknown[]) => {
        if (await apontaParaOutro(a[0], alvo)) return RECUSA_FORA_DA_CONDUCAO;
        return executar(...a);
      }) as unknown as T["execute"],
    };
  }
  return saida;
}
