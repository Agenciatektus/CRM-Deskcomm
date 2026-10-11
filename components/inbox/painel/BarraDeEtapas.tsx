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
  /** A posição atual na coluna, para o "Desfazer" devolver o card ao mesmo lugar. */
  posicao?: number | null;
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
export function BarraDeEtapas({ leadId, pipelineId, stageId, posicao = null, updatedAt, aberto, etapas, leitura, onMovido }: Props) {
  const t = useT();
  const podeMover = usePermission("pipeline.move_card") && !leitura && aberto;
  const mover = useMoveCard(pipelineId);
  const passos = etapas.filter((e) => !e.is_won && !e.is_lost);
  const atual = passos.findIndex((e) => e.id === stageId);
  if (passos.length === 0) return null;

  function irPara(id: string) {
    if (id === stageId || !podeMover) return;
    // A etapa de onde o negócio sai: é para ela que o "Desfazer" volta.
    const anterior = stageId;
    const posicaoAnterior = posicao;
    mover.mutate(
      { leadId, stageId: id, positionInStage: fimDaColuna(), expectedUpdatedAt: updatedAt },
      {
        onSuccess: (resposta) => {
          toast.success(t("Etapa alterada"), {
            // P2 do Cassio na #157: um clique na barra errada não pode custar
            // achar a etapa de volta à mão. Volta pela MESMA rota (`/move`), com
            // a data de atualização que a própria mudança devolveu: se outra
            // pessoa mexeu no meio, a rota recusa em vez de sobrescrever.
            action: {
              label: t("Desfazer"),
              onClick: () => desfazer(anterior, posicaoAnterior, resposta?.data?.updated_at),
            },
          });
          onMovido();
        },
      },
    );
  }

  /**
   * Volta pela mesma rota `/move`, na POSIÇÃO de antes (P2 do Cassio na #158):
   * a rota aceita `position_in_stage`, e sem ela o card voltava para o fim da
   * coluna. Sem a posição conhecida (resumo antigo em cache), cai no fim.
   *
   * ⚠️ Efeito nas automações: desfazer é uma MUDANÇA DE ETAPA como outra
   * qualquer. A ida já emitiu `lead.stage_changed` (e as regras de automação,
   * follow-ups e a conversão do funil já reagiram a ela); a volta emite outro
   * `lead.stage_changed`, e as regras ligadas à etapa de origem disparam de
   * novo. Nada do que a ida disparou é desfeito: mensagem enviada continua
   * enviada. Por isso o botão vive só no toast, logo depois do clique.
   */
  function desfazer(etapa: string, posicaoDeAntes: number | null, atualizadoEm: string | undefined) {
    if (!atualizadoEm) return;
    mover.mutate(
      { leadId, stageId: etapa, positionInStage: posicaoDeAntes ?? fimDaColuna(), expectedUpdatedAt: atualizadoEm },
      {
        onSuccess: () => {
          toast.success(t("Etapa desfeita"));
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
