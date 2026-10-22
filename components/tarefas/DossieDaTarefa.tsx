"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { LeadDossier } from "@/components/kanban/LeadDossier";
import { useT } from "@/hooks/i18n/useT";
import { useBoard } from "@/hooks/kanban/useBoard";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";

/**
 * O DOSSIÊ DO NEGÓCIO aberto a partir de uma tarefa, sem sair da tela de
 * Tarefas — detalhes, linha do tempo e a conversa ao lado (`LeadDossier`, a
 * MESMA peça do Funil).
 *
 * O negócio vem do QUADRO do funil dele (`useBoard`, a mesma consulta e a
 * mesma chave de cache do Funil), e não de uma rota nova: o dossiê precisa do
 * lead como o quadro o monta (conversa, próximo passo, dono), das etapas e dos
 * campos do funil, e uma segunda forma de montar isso divergiria da primeira.
 * Quem acabou de vir do Funil abre na hora, pelo cache.
 *
 * Negócio que saiu do alcance (apagado, ou o funil mudou) fecha com aviso, em
 * vez de um painel vazio.
 */
export function DossieDaTarefa({
  leadId,
  pipelineId,
  ownerNames,
  onFechar,
}: {
  leadId: string;
  pipelineId: string;
  ownerNames: Map<string, string | null>;
  onFechar: () => void;
}) {
  const t = useT();
  const { data, isLoading, isError } = useBoard(pipelineId);
  const lead = useMemo(() => data?.leads.find((l) => l.id === leadId) ?? null, [data, leadId]);

  const sumiu = !isLoading && (isError || (data && !lead));
  useEffect(() => {
    if (!sumiu) return;
    toast.warning(t("Não encontrei este negócio no funil dele. Ele pode ter sido apagado ou movido."));
    onFechar();
  }, [sumiu, onFechar, t]);

  if (!data || !lead) return null;

  return (
    <LeadDossier
      open
      onOpenChange={(aberto) => !aberto && onFechar()}
      lead={lead}
      pipelineId={pipelineId}
      fieldDefs={camposDoFunil(data.pipeline.settings ?? null)}
      stageName={data.stages.find((s) => s.id === lead.stage_id)?.name ?? "—"}
      etapas={data.stages.filter((s) => !s.is_archived)}
      ownerNames={ownerNames}
    />
  );
}
