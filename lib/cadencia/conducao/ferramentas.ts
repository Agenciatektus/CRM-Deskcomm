/**
 * ANTI-IDOR DA CONDUÇÃO — uma conversa aberta pela cadência só mexe no negócio dela.
 *
 * A allowlist por preset (`presets.ts`) decide QUAIS ferramentas a IA recebe; este
 * wrapper decide SOBRE QUEM elas agem. Toda ferramenta que aceita `lead_id`,
 * `contact_id` ou `conversation_id` é recusada quando o valor não é o da condução
 * — em LEITURA também: ver o negócio de outra pessoa já é vazamento, e o modelo
 * pode ter lido um id de outro lead numa mensagem manipulada. `appointment_id` é
 * conferido no banco (o compromisso tem de ser do contato da condução). O par
 * `target_kind`/`target_id` (`crm_manage_tags`) vale só com o tipo certo, e a
 * listagem da agenda (`crm_list_appointments`) só roda com o contato da condução.
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

/**
 * As chaves de id que o wrapper confere — a lista que o teste de cobertura
 * (`ferramentas.test.ts`) cruza com o `inputSchema` de TODA ferramenta dos
 * presets: ferramenta nova com outra chave de pessoa/negócio/conversa reprova
 * lá, em vez de reabrir o buraco em silêncio.
 */
export const CHAVES_CONFERIDAS = ["lead_id", "contact_id", "conversation_id", "appointment_id", "target_id"] as const;

/**
 * Ferramentas de LISTAGEM que sem filtro alcançam outras pessoas: na condução
 * elas só rodam com o `contact_id` da condução (a agenda de um dia inteiro da
 * equipe traria compromissos de outros clientes).
 */
export const EXIGEM_O_CONTATO_DA_CONDUCAO: ReadonlySet<string> = new Set(["crm_list_appointments"]);

function presente(v: unknown): boolean {
  return v !== undefined && v !== null;
}

/** `true` quando a chamada aponta para alguém que não é o da condução. */
export async function apontaParaOutro(args: unknown, alvo: AlvoDaConducao, ferramenta?: string): Promise<boolean> {
  const lead = valor(args, "lead_id");
  if (presente(lead) && lead !== alvo.leadId) return true;
  const contato = valor(args, "contact_id");
  if (presente(contato) && contato !== alvo.contactId) return true;
  const conversa = valor(args, "conversation_id");
  if (presente(conversa) && conversa !== alvo.conversationId) return true;
  const agendamento = valor(args, "appointment_id");
  if (presente(agendamento)) {
    if (typeof agendamento !== "string" || alvo.agendamentoEhDaConducao === undefined) return true;
    if (!(await alvo.agendamentoEhDaConducao(agendamento))) return true;
  }
  // Par polimórfico (`crm_manage_tags`): o id só vale junto com o tipo dele.
  const alvoId = valor(args, "target_id");
  const alvoKind = valor(args, "target_kind");
  if (presente(alvoId) || presente(alvoKind)) {
    const esperado =
      alvoKind === "lead"
        ? alvo.leadId
        : alvoKind === "contact"
          ? alvo.contactId
          : alvoKind === "conversation"
            ? alvo.conversationId
            : undefined;
    if (esperado === undefined || esperado === null || alvoId !== esperado) return true;
  }
  if (ferramenta !== undefined && EXIGEM_O_CONTATO_DA_CONDUCAO.has(ferramenta) && contato !== alvo.contactId) {
    return true;
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
        if (await apontaParaOutro(a[0], alvo, nome)) return RECUSA_FORA_DA_CONDUCAO;
        return executar(...a);
      }) as unknown as T["execute"],
    };
  }
  return saida;
}
