"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LeadRow } from "@/components/inbox/painel/tipos";
import { useT } from "@/hooks/i18n/useT";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import { avisarQueOCrmDoContatoMudou } from "@/lib/inbox/releitura-do-contato";
import { useAcaoPendente } from "@/lib/ui/aviso-com-desfazer";
import { adiarFechamento } from "@/lib/ui/fechar-negocio";

/**
 * O pedido que precisa de janela própria: perder com motivo, levar a outro funil, ou
 * CRIAR o negócio quando o contato não tem nenhum (M2.4, `NewLeadDialog` com o contato).
 */
export type DialogoDoFunil = { tipo: "perder" | "outro-funil"; lead: LeadRow } | { tipo: "criar-lead" };

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
 * `SeletorDeEtapa` já usa, com as mesmas garantias:
 * - etapa aberta → `useMoveCard` (CAS por `updated_at`), com "Desfazer" no aviso
 *   pela MESMA rota, como a barra de etapas do painel (P2-3 do Cassio na #180);
 * - ganho → `useWinLead`, ADIADO 5 s com Desfazer e com a trava por negócio
 *   (`ganho:<lead>`) do painel e do quadro: `/win` dispara `lead.won` na hora, com
 *   efeito fora do CRM (conversão de anúncio, cadência, push). P1 do Cassio na #180;
 * - perda → `LoseLeadDialog` (pelo `onDialogo`), que exige o motivo.
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
  const ganhoPendente = useAcaoPendente(`ganho:${lead?.id ?? ""}`);

  function reler() {
    void qc.invalidateQueries({ queryKey: chaveDoResumoDoMenu(contactId) });
    // O painel aberto neste contato relê; com outro contato, ignora.
    avisarQueOCrmDoContatoMudou(contactId);
  }

  function feito() {
    toast.success(t("Etapa alterada"));
    reler();
  }

  function escolher(stageId: string) {
    if (!lead || stageId === lead.stage_id) return;
    const alvo = etapas.find((e) => e.id === stageId);
    if (!alvo) return;
    if (alvo.is_lost) return onDialogo({ tipo: "perder", lead });
    // `mutateAsync` e não `mutate(…, { onSuccess })`: o menu FECHA (e desmonta)
    // ao escolher, e o callback por chamada do react-query não roda em
    // componente desmontado. O erro já vira aviso no `onError` do hook.
    const ignorar = () => undefined;
    if (alvo.is_won) {
      // A trava confere ganho, perda e troca deste negócio (de onde vierem).
      adiarFechamento("ganho", lead.id, (s) => `${t("Ganho em")} ${s} s`, t, () =>
        ganhar.mutateAsync({ leadId: lead.id }).then(feito, ignorar),
      );
      return;
    }
    const anterior = lead.stage_id;
    const posicaoAnterior = lead.position_in_stage ?? null;
    // Fim da coluna de destino, a mesma conta do seletor do painel.
    void mover
      .mutateAsync({ leadId: lead.id, stageId, positionInStage: Date.now(), expectedUpdatedAt: lead.updated_at })
      .then((resposta) => {
        reler();
        const atualizadoEm = (resposta as { data?: { updated_at?: string } } | undefined)?.data?.updated_at;
        toast.success(t("Etapa alterada"), {
          // Volta pela MESMA rota `/move`, com a data que a mudança devolveu: se outra
          // pessoa mexeu no meio, a rota recusa em vez de sobrescrever.
          action: atualizadoEm
            ? {
                label: t("Desfazer"),
                onClick: () =>
                  void mover
                    .mutateAsync({
                      leadId: lead.id,
                      stageId: anterior,
                      positionInStage: posicaoAnterior ?? Date.now(),
                      expectedUpdatedAt: atualizadoEm,
                    })
                    .then(() => {
                      toast.success(t("Etapa desfeita"));
                      reler();
                    }, ignorar),
              }
            : undefined,
        });
      }, ignorar);
  }

  return { resumo, lead, etapas, indiceAtual, escolher, mover, ganhar, ganhoPendente };
}
