/**
 * As tarefas de exemplo da seção "Tarefas" da vitrine do design system. Dados
 * inventados (nenhum vem do banco), com os ids da vitrine
 * (`PREFIXO_DA_VITRINE`): se alguma peça pedisse algo à API com eles, a
 * chamada ficaria no navegador.
 *
 * Os prazos são relativos a `agora`, para os estados (atrasada há dias, hoje,
 * encerrada) valerem em qualquer dia em que a vitrine for aberta.
 */
import type { Tarefa } from "@/lib/tarefas/tipos";

import { IDS } from "./ids";

const HORA = 3_600_000;
const DIA = 24 * HORA;

function tarefa(n: number, parcial: Partial<Tarefa>, agora: number): Tarefa {
  return {
    id: IDS.tarefaDaLista(n),
    organization_id: IDS.org,
    title: "",
    description: null,
    due_date: null,
    priority: "medium",
    status: "pending",
    lead_id: null,
    contact_id: null,
    demanda_id: null,
    assigned_to: IDS.atendente,
    created_by: IDS.atendente,
    created_at: new Date(agora - 20 * DIA).toISOString(),
    updated_at: new Date(agora - DIA).toISOString(),
    lead: null,
    contato: null,
    ...parcial,
  };
}

export function tarefasDaVitrine(agora: number): Record<"atrasada" | "hoje" | "doContato" | "avulsa" | "encerrada", Tarefa> {
  const negocio = {
    id: IDS.lead,
    title: "Rafael Nogueira",
    pipeline_id: IDS.funil,
    stage_id: IDS.etapa(1),
    funil: { id: IDS.funil, name: "Vendas" },
    etapa: { id: IDS.etapa(1), name: "Proposta" },
  };
  return {
    atrasada: tarefa(1, {
      title: "Enviar a proposta revisada",
      description: "Com o desconto de 5% combinado na ligação",
      due_date: new Date(agora - 16 * DIA).toISOString(),
      priority: "urgent",
      lead_id: IDS.lead,
      contact_id: IDS.contato,
      lead: negocio,
    }, agora),
    hoje: tarefa(2, {
      title: "Ligar para confirmar o horário",
      due_date: new Date(agora + 2 * HORA).toISOString(),
      priority: "high",
      lead_id: IDS.lead,
      lead: negocio,
      assigned_to: IDS.colega,
    }, agora),
    doContato: tarefa(3, {
      title: "Mandar o catálogo novo",
      due_date: new Date(agora + 3 * DIA).toISOString(),
      contact_id: IDS.contato,
      contato: { id: IDS.contato, name: null, display_name: "Carla Mendes", phone_number: null },
      assigned_to: null,
    }, agora),
    avulsa: tarefa(4, { title: "Revisar os textos do agente", priority: "low" }, agora),
    encerrada: tarefa(5, {
      title: "Separar as fotos do pedido",
      due_date: new Date(agora - 2 * DIA).toISOString(),
      status: "done",
      lead_id: IDS.lead,
      lead: negocio,
    }, agora),
  };
}

export const MEMBROS_DA_VITRINE = [
  { user_id: IDS.atendente, full_name: "Ana Souza" },
  { user_id: IDS.colega, full_name: "Bruno Lima" },
];
