"use client";
import { toast } from "sonner";

import { LoseLeadDialog } from "@/components/kanban/LoseLeadDialog";
import { useT } from "@/hooks/i18n/useT";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";
import { adiarFechamento, fechamentoPendente } from "@/lib/ui/fechar-negocio";
import { Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useState } from "react";

import { FolhaInferior } from "../FolhaInferior";

/** O fim da coluna de destino: maior que qualquer posição que o quadro gera (a conta do painel). */
function fimDaColuna(): number {
  return Date.now();
}

/**
 * "Mover etapa" de um card do Funil no celular (M3.1), com as regras do quadro:
 * - etapa aberta → `/move` (CAS por `updated_at`) com "Desfazer" pela mesma rota;
 * - etapa de GANHO → o mesmo `/move` do arraste do quadro, ADIADO 5 s com Desfazer e
 *   a trava por negócio (`adiarFechamento`): fecha o negócio, com efeito fora do CRM;
 * - etapa de PERDA → a janela do motivo (`LoseLeadDialog`), também adiada e travada.
 */
export function FolhaMoverEtapaDoLead({
  lead,
  etapas,
  pipelineId,
  aoFechar,
}: {
  lead: Lead | null;
  etapas: Stage[];
  pipelineId: string;
  aoFechar: () => void;
}) {
  const t = useT();
  const mover = useMoveCard(pipelineId);
  const [perdendo, setPerdendo] = useState<Lead | null>(null);
  const ignorar = () => undefined;

  function escolher(alvo: Stage) {
    if (!lead || alvo.id === lead.stage_id) return aoFechar();
    aoFechar();
    if (alvo.is_lost) return setPerdendo(lead);
    const args = { leadId: lead.id, stageId: alvo.id, positionInStage: fimDaColuna(), expectedUpdatedAt: lead.updated_at };
    if (alvo.is_won) {
      adiarFechamento("ganho", lead.id, (s) => `${t("Ganho em")} ${s} s`, t, () =>
        mover.mutateAsync(args).then(ignorar, ignorar),
      );
      return;
    }
    const anterior = lead.stage_id;
    const posicaoAnterior = lead.position_in_stage;
    void mover.mutateAsync(args).then((resposta) => {
      const atualizadoEm = (resposta as { data?: { updated_at?: string } } | undefined)?.data?.updated_at;
      toast.success(t("Etapa alterada"), {
        action: atualizadoEm
          ? {
              label: t("Desfazer"),
              onClick: () =>
                void mover
                  .mutateAsync({ leadId: lead.id, stageId: anterior, positionInStage: posicaoAnterior, expectedUpdatedAt: atualizadoEm })
                  .then(() => toast.success(t("Etapa desfeita")), ignorar),
            }
          : undefined,
      });
    }, ignorar);
  }

  const atual = lead ? etapas.findIndex((e) => e.id === lead.stage_id) : -1;
  const travado = !!lead && fechamentoPendente(lead.id);

  return (
    <>
      <FolhaInferior aberto={!!lead} aoMudar={(v) => !v && aoFechar()} titulo={t("Mover etapa")} subtitulo={lead?.title}>
        {etapas.map((e, i) => (
          <button
            key={e.id}
            type="button"
            disabled={mover.isPending || travado}
            aria-current={i === atual ? "step" : undefined}
            onClick={() => escolher(e)}
            className="pele-foco flex min-h-(--mb-folha-item) w-full items-center gap-3 rounded-[14px] px-3 text-left text-base font-semibold text-text hover:bg-hover disabled:text-text-subtle"
          >
            <span
              aria-hidden
              className={cn(
                "size-3 shrink-0 rounded-full border-2 border-border-strong",
                e.is_won && "border-success-fg",
                e.is_lost && "border-error-fg",
                i <= atual && !e.is_won && !e.is_lost && "border-accent bg-accent",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            {i === atual && <Check size={18} className="text-accent-text" aria-hidden />}
          </button>
        ))}
      </FolhaInferior>
      {perdendo && (
        <LoseLeadDialog
          open
          onOpenChange={(v) => !v && setPerdendo(null)}
          leadId={perdendo.id}
          pipelineId={pipelineId}
          adiar={(gravar) =>
            adiarFechamento("perda", perdendo.id, (s) => `${t("Perdido em")} ${s} s`, t, () =>
              gravar().then(ignorar, ignorar),
            )
          }
        />
      )}
    </>
  );
}
