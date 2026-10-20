/**
 * Amostras da coluna do lead e da aba Negócios para a vitrine do design system:
 * o resumo do contato (a resposta de `/crm-summary`), as tarefas, a equipe e os
 * funis. Valores plausíveis para o desenho ser julgável; nada vem do banco.
 */
import type { LeadRow } from "@/components/inbox/painel/tipos";
import type { Tarefa } from "@/lib/tarefas/tipos";

import { minutosAtras } from "./conversa";
import { IDS } from "./ids";

const ETAPAS = [
  { id: IDS.etapa(1), name: "Novo", is_won: false, is_lost: false },
  { id: IDS.etapa(2), name: "Qualificado", is_won: false, is_lost: false },
  { id: IDS.etapa(3), name: "Avaliação", is_won: false, is_lost: false },
  { id: IDS.etapa(4), name: "Negociação", is_won: false, is_lost: false },
  { id: IDS.etapa(5), name: "Fechado", is_won: true, is_lost: false },
  { id: IDS.etapa(6), name: "Perdido", is_won: false, is_lost: true },
];

export function leadDaVitrine(agora: number, semTarefa = false): LeadRow {
  return {
    id: semTarefa ? IDS.leadSemTarefa : IDS.lead,
    title: "Clareamento",
    status: "open",
    value_cents: 480000,
    currency: "BRL",
    updated_at: minutosAtras(agora, 30),
    pipeline_id: IDS.funil,
    stage_id: IDS.etapa(4),
    position_in_stage: 0,
    etapas: ETAPAS,
    etapas_do_funil: ETAPAS,
    motivos_de_perda: ["Preço", "Escolheu outra clínica", "Parou de responder"],
    motivo_de_perda_obrigatorio: true,
    custom_fields: {},
    field_defs: [],
    funil_nome: "Vendas Clínica",
    etapa_nome: "Negociação",
    owner_user_id: IDS.atendente,
    owner_agent_id: null,
    lost_reason: null,
  };
}

export function resumoDaVitrine(agora: number, semTarefa = false) {
  return {
    data: {
      enrichment: null,
      enrichment_error: false,
      leads: [leadDaVitrine(agora, semTarefa)],
      orders: [],
      activities: [
        {
          id: IDS.mensagem(90),
          type: "stage_changed",
          source_module: "kanban",
          performed_at: minutosAtras(agora, 30),
          payload: { from_stage_name: "Avaliação", to_stage_name: "Negociação" },
          reason: null,
          actor_kind: "user",
          performed_by_name: "Ana",
        },
      ],
      demandas: [],
      fatos: [{ id: IDS.mensagem(91), headline: "Prefere atendimento aos sábados", body: "Disse duas vezes na conversa." }],
      historico: [],
    },
  };
}

export function tarefasDaVitrine(agora: number): Tarefa[] {
  return [
    {
      id: IDS.tarefa,
      organization_id: IDS.org,
      title: "Ligar para confirmar o horário de sábado",
      description: null,
      due_date: minutosAtras(agora, 60 * 24),
      priority: "high",
      status: "pending",
      lead_id: IDS.lead,
      contact_id: IDS.contato,
      demanda_id: null,
      assigned_to: IDS.atendente,
      created_by: IDS.atendente,
      created_at: minutosAtras(agora, 60 * 48),
      updated_at: minutosAtras(agora, 60 * 48),
    },
  ];
}

export const EQUIPE_DA_VITRINE = [
  { user_id: IDS.atendente, role: "agent", full_name: "Ana Lima" },
  { user_id: IDS.colega, role: "agent", full_name: "Bruno Reis" },
];

export const FUNIS_DA_VITRINE = [
  { id: IDS.funil, name: "Vendas Clínica" },
  { id: IDS.outroFunil, name: "Pós-venda" },
];

export function contatoDaVitrine(agora: number, semTarefa = false) {
  return {
    data: {
      id: semTarefa ? IDS.contatoSemTarefa : IDS.contato,
      organization_id: IDS.org,
      display_name: "Mariana Couto",
      name: "Mariana Couto",
      phone_number: "+5511984723310",
      email: "mariana@exemplo.test",
      notes: "Prefere atendimento aos sábados",
      tags: ["anuncio-meta", "clareamento"],
      custom_fields: {},
      is_blocked: false,
      is_anonymized: false,
      created_at: minutosAtras(agora, 60 * 24 * 30),
      updated_at: minutosAtras(agora, 60),
    },
  };
}
