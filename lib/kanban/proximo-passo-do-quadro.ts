import type { Lead } from "@/lib/types/leads";

/** A linha de `crm_tasks` que o quadro lê para o próximo passo. */
export interface TarefaAbertaDoQuadro {
  lead_id: string;
  title: string;
  due_date: string | null;
  created_at: string;
}

/**
 * Anexa a cada lead a tarefa aberta mais urgente: a de prazo mais cedo (sem
 * prazo fica por último), empate pela mais antiga. Lead sem tarefa aberta
 * recebe `null` explícito, que o card desenha como "Sem próximo passo".
 *
 * PURA, como `anexarDadosDoContato`: a consulta mora na rota do quadro.
 */
export function anexarProximoPasso(leads: Lead[], tarefas: TarefaAbertaDoQuadro[]): Lead[] {
  const chave = (t: TarefaAbertaDoQuadro) => `${t.due_date ?? "9999"}|${t.created_at}`;
  const porLead = new Map<string, TarefaAbertaDoQuadro>();
  for (const tarefa of tarefas) {
    const atual = porLead.get(tarefa.lead_id);
    if (!atual || chave(tarefa) < chave(atual)) porLead.set(tarefa.lead_id, tarefa);
  }
  return leads.map((lead) => {
    const tarefa = porLead.get(lead.id);
    return {
      ...lead,
      proximo_passo: tarefa ? { titulo: tarefa.title, prazo: tarefa.due_date } : null,
    };
  });
}
