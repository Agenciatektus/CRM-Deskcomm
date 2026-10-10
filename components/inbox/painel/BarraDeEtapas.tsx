"use client";
import { toast } from "sonner";

import type { EtapaDoSeletor } from "@/components/kanban/SeletorDeEtapa";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { cn } from "@/lib/utils";

interface Props {
  leadId: string;
  pipelineId: string;
  stageId: string;
  updatedAt: string;
  /** Só o negócio ABERTO anda pelas etapas; ganho e perdido têm os próprios botões. */
  aberto: boolean;
  etapas: EtapaDoSeletor[];
  leitura: boolean;
  onMovido: () => void;
}

/**
 * As etapas do negócio como BARRA DE PASSOS clicável (P15 da auditoria; o
 * `.steps` / `.step` do protótipo): as etapas já vencidas e a atual pintadas,
 * a atual com o nome em negrito.
 *
 * Só as etapas de ANDAMENTO entram: ganho e perdido são desfechos, com os
 * botões e as confirmações próprias em `AcoesDoNegocio`. Clicar move pela MESMA
 * rota do quadro (`/move` com a data de atualização, que recusa se outra
 * pessoa mexeu antes), com a mesma permissão (`pipeline.move_card`).
 */
export function BarraDeEtapas({ leadId, pipelineId, stageId, updatedAt, aberto, etapas, leitura, onMovido }: Props) {
  const t = useT();
  const podeMover = usePermission("pipeline.move_card") && !leitura && aberto;
  const mover = useMoveCard(pipelineId);
  const passos = etapas.filter((e) => !e.is_won && !e.is_lost);
  const atual = passos.findIndex((e) => e.id === stageId);
  if (passos.length === 0) return null;

  function irPara(id: string) {
    if (id === stageId || !podeMover) return;
    mover.mutate(
      { leadId, stageId: id, positionInStage: fimDaColuna(), expectedUpdatedAt: updatedAt },
      {
        onSuccess: () => {
          toast.success(t("Etapa alterada"));
          onMovido();
        },
      },
    );
  }

  return (
    <ol
      aria-label={t("Etapas do funil")}
      data-testid="barra-de-etapas"
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${passos.length}, minmax(0, 1fr))` }}
    >
      {passos.map((e, i) => {
        const feito = atual >= 0 && i < atual;
        const agora = i === atual;
        return (
          <li key={e.id} className="min-w-0">
            <button
              type="button"
              disabled={!podeMover || mover.isPending}
              aria-current={agora ? "step" : undefined}
              title={e.name}
              onClick={() => irPara(e.id)}
              className="group w-full rounded-sm py-1 text-left disabled:cursor-default focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <i
                aria-hidden
                className={cn(
                  "block h-1.5 rounded-sm",
                  feito || agora ? "bg-accent dark:bg-(image:--pele-grad-texto)" : "bg-border group-enabled:group-hover:bg-accent-soft",
                  agora && "ring-3 ring-accent-soft",
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block truncate text-[11px]",
                  agora ? "font-bold text-text" : "text-text-subtle",
                )}
              >
                {e.name}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Vai para o fim da coluna de destino, como o seletor do quadro: `Date.now()` é
 * maior que qualquer posição que o quadro gera.
 */
function fimDaColuna(): number {
  return Date.now();
}
