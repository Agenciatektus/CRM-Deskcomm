"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LeadRow } from "@/components/inbox/painel/tipos";
import { useT } from "@/hooks/i18n/useT";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import { avisarQueOCrmDoContatoMudou } from "@/lib/inbox/releitura-do-contato";

/** O pedido que precisa de janela própria (perder com motivo, levar a outro funil). */
export type DialogoDoFunil = { tipo: "perder" | "outro-funil"; lead: LeadRow };

/** A chave do resumo do CRM do contato que o menu e a faixa do celular leem. */
export function chaveDoResumoDoMenu(contactId: string) {
  return ["menu-da-conversa", "crm-summary", contactId] as const;
}

/**
 * O NEGÓCIO DO CONTATO E TROCAR DE ETAPA, numa régua só: o submenu "Funil e etapa"
 * do menu da conversa e a faixa do lead da conversa no celular (M2.3) usam isto.
 *
 * O `crm-summary` só é buscado com `habilitado` (o submenu aberto, ou a conversa
 * aberta no celular) e fica 30 s em cache. Cada destino é a porta que o
 * `SeletorDeEtapa` já usa: etapa aberta → `useMoveCard` (CAS por `updated_at`);
 * ganho → `useWinLead`; perda → `LoseLeadDialog` (pelo `onDialogo`).
 */
export function useFunilDoContato(contactId: string, habilitado: boolean, onDialogo: (d: DialogoDoFunil) => void) {
  const t = useT();
  const qc = useQueryClient();
  const resumo = useQuery({
    queryKey: chaveDoResumoDoMenu(contactId),
    queryFn: () => apiClient.get<{ data: { leads: LeadRow[] } }>(`/api/v1/contacts/${contactId}/crm-summary`),
    enabled: habilitado,
    staleTime: 30_000,
    select: (r) => r.data.leads ?? [],
  });
  const lead = resumo.data?.[0] ?? null;
  const pipelineId = lead?.pipeline_id ?? "";
  const mover = useMoveCard(pipelineId);
  const ganhar = useWinLead(pipelineId);
  const etapas = lead?.etapas ?? [];
  const indiceAtual = etapas.findIndex((e) => e.id === lead?.stage_id);

  function feito() {
    toast.success(t("Etapa alterada"));
    void qc.invalidateQueries({ queryKey: chaveDoResumoDoMenu(contactId) });
    // O painel aberto neste contato relê; com outro contato, ignora.
    avisarQueOCrmDoContatoMudou(contactId);
  }

  function escolher(stageId: string) {
    if (!lead || stageId === lead.stage_id) return;
    const alvo = etapas.find((e) => e.id === stageId);
    if (!alvo) return;
    if (alvo.is_lost) return onDialogo({ tipo: "perder", lead });
    // `mutateAsync` e não `mutate(…, { onSuccess })`: o menu FECHA (e desmonta)
    // ao escolher, e o callback por chamada do react-query não roda em
    // componente desmontado. A promessa resolve de qualquer jeito. O erro já
    // vira aviso no `onError` do hook.
    const ignorar = () => {};
    if (alvo.is_won) return void ganhar.mutateAsync({ leadId: lead.id }).then(feito, ignorar);
    // Fim da coluna de destino, a mesma conta do seletor do painel.
    void mover
      .mutateAsync({ leadId: lead.id, stageId, positionInStage: Date.now(), expectedUpdatedAt: lead.updated_at })
      .then(feito, ignorar);
  }

  return { resumo, lead, etapas, indiceAtual, escolher, mover, ganhar };
}
