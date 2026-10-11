/**
 * Amostras da Central de avisos e da Busca geral (Ctrl K) para a vitrine do
 * design system. Os tipos são os de `agent_inbox_items`; nada vem do banco.
 */
import type { AgentInboxItem } from "@/hooks/ai/useAgentInbox";

import { conversaDaVitrine, minutosAtras } from "./conversa";
import { IDS } from "./ids";
import { leadDaVitrine } from "./painel";

export function avisosDaVitrine(agora: number, status: "open" | "resolved") {
  const abertos: AgentInboxItem[] = [
    {
      id: IDS.aviso(1),
      kind: "routing_unassigned",
      severity: "critical",
      title: "Rafael Nogueira está sem dono",
      body: "Esperando há 38 min no Direct.",
      ref_kind: "conversation",
      ref_id: IDS.conversa,
      status: "open",
      created_at: minutosAtras(agora, 38),
      destination: { estado: "disponivel", rotulo: "Assumir", href: `/app/inbox?c=${IDS.conversa}` },
    },
    {
      id: IDS.aviso(2),
      kind: "appointment_outcome_required",
      severity: "warn",
      title: "Como foi a consulta de Carlos?",
      body: "Consulta de hoje às 9:00.",
      ref_kind: "appointment",
      ref_id: IDS.aviso(20),
      status: "open",
      created_at: minutosAtras(agora, 90),
      destination: { estado: "disponivel", rotulo: "Abrir na agenda", href: "/app/agenda" },
    },
    {
      id: IDS.aviso(3),
      kind: "handoff",
      severity: "info",
      title: "A IA passou o atendimento de Mariana Couto",
      body: "Cliente quer confirmar horário no sábado.",
      ref_kind: "conversation",
      ref_id: IDS.conversa,
      status: "open",
      created_at: minutosAtras(agora, 20),
      destination: { estado: "disponivel", rotulo: "Abrir conversa", href: `/app/inbox?c=${IDS.conversa}` },
    },
  ];
  const resolvidos: AgentInboxItem[] = [
    {
      id: IDS.aviso(4),
      kind: "qr_rescan",
      severity: "critical",
      title: "WhatsApp da recepção desconectou",
      body: "Reconectado às 8:12.",
      ref_kind: null,
      ref_id: null,
      status: "resolved",
      created_at: minutosAtras(agora, 300),
      destination: { estado: "sem_destino", orientacao: "Já resolvido." },
    },
  ];
  const items = status === "open" ? abertos : resolvidos;
  return { data: { items, open_count: abertos.length } };
}

/** A busca remota da paleta: conversas, contatos e leads que casam com o termo. */
export function buscaDaVitrine(agora: number, recurso: "conversations" | "contacts" | "leads") {
  if (recurso === "conversations") return { data: [conversaDaVitrine(agora)] };
  if (recurso === "contacts") return { data: [] };
  const lead = leadDaVitrine(agora);
  return {
    data: [
      {
        id: lead.id,
        title: "Mariana Couto",
        pipeline_id: lead.pipeline_id,
        pipeline_name: lead.funil_nome,
        stage_name: "Qualificado",
        value_cents: 120000,
        currency: "BRL",
        contact_id: IDS.contato,
        status: "open",
      },
    ],
  };
}
