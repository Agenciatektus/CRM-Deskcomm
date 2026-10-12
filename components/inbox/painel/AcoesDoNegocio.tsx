"use client";

import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { FormularioDePerda } from "@/components/kanban/LoseLeadDialog";
import { FormularioDeOutroFunil } from "@/components/kanban/MoveToOtherPipelineDialog";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import { CANONICAL_LOST_REASONS, rotuloDoMotivoDePerda } from "@/lib/schemas/leads";
import { avisarComDesfazer } from "@/lib/ui/aviso-com-desfazer";
import { Check, ArrowsClockwise, Funnel, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { ResponsavelDoNegocio } from "./ResponsavelDoNegocio";
import type { LeadRow } from "./tipos";

/**
 * As ações do negócio no painel da conversa, no desenho do quadro DS ("Negócio").
 *
 * ⚠️ NENHUMA REGRA NOVA: cada botão chama a porta que o quadro já usa (`/win`,
 * `/lose` com os motivos DO FUNIL e o motivo opcional por funil da 9044, `/clone`
 * para outro funil, `/retomar` para reabrir).
 *
 * O que muda é o RETORNO (quadro DS, "Aviso com Desfazer"): Ganho acontece na
 * hora, sem janela de confirmação, e o aviso embaixo oferece Desfazer por 5 s.
 * Desfazer volta o negócio para a etapa de onde saiu pela MESMA rota `/move` do
 * quadro, com a data que a própria ação devolveu (se alguém mexeu no meio, a
 * rota recusa em vez de sobrescrever). Num funil que reabre como negócio novo,
 * a rota recusa a volta e o erro aparece. Perdido e Outro funil seguem com o
 * formulário no lugar e ganham o mesmo Desfazer. Reabrir cria um registro, e
 * por isso pede confirmação DENTRO do painel, sem janela modal.
 */
export function AcoesDoNegocio({ lead, contactId, leitura, onMudou }: {
  lead: LeadRow;
  contactId: string | null;
  leitura: boolean;
  onMudou: () => void;
}) {
  const t = useT();
  const podeMexer = usePermission("pipeline.move_card") && !leitura;
  const ganhar = useWinLead(lead.pipeline_id);
  const mover = useMoveCard(lead.pipeline_id);
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false);
  const [perdendo, setPerdendo] = useState(false);
  const [trocandoDeFunil, setTrocandoDeFunil] = useState(false);
  const [retomando, setRetomando] = useState(false);

  const aberto = lead.status === "open";
  const motivo = lead.lost_reason ?? null;
  const rotuloDoMotivo = motivo
    ? (CANONICAL_LOST_REASONS as readonly string[]).includes(motivo) ? t(rotuloDoMotivoDePerda(motivo)) : motivo
    : null;

  /** Devolve o negócio à etapa e à posição de antes (o Desfazer de ganho, perda e troca). */
  const etapaDeAntes = { stageId: lead.stage_id, posicao: lead.position_in_stage ?? null };
  async function voltarParaAEtapa(atualizadoEm: string | undefined) {
    if (!atualizadoEm) throw new Error(t("Não foi possível desfazer: recarregue o painel."));
    await mover.mutateAsync({
      leadId: lead.id,
      stageId: etapaDeAntes.stageId,
      positionInStage: etapaDeAntes.posicao ?? Date.now(),
      expectedUpdatedAt: atualizadoEm,
    });
    onMudou();
  }

  function marcarGanho() {
    ganhar.mutate(
      { leadId: lead.id },
      {
        onSuccess: (resposta) => {
          onMudou();
          avisarComDesfazer(t("Negócio marcado como ganho."), t("Desfazer"), () =>
            voltarParaAEtapa(resposta?.data?.updated_at),
          );
        },
      },
    );
  }

  async function retomar() {
    setRetomando(true);
    try {
      // Sem `stage_id`: o servidor escolhe a primeira etapa aberta do funil.
      await apiClient.post(`/api/v1/leads/${lead.id}/retomar`, {});
      toast.success(t("Negócio retomado como novo."));
      setConfirmandoReabrir(false);
      onMudou();
    } catch (erro) {
      showApiError(erro);
    } finally {
      setRetomando(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="inbox-acoes-do-negocio">
      {lead.status === "won" && (
        <div className="flex items-center gap-2 rounded-field bg-success-bg px-3 py-2.25 text-[13.5px] font-semibold text-success-fg">
          <Check size={14} aria-hidden /> <span className="grow">{t("Negócio ganho")}</span>
        </div>
      )}
      {lead.status === "lost" && (
        <div className="flex items-center gap-2 rounded-field bg-error-bg px-3 py-2.25 text-[13.5px] font-semibold text-error-fg">
          <X size={14} aria-hidden />
          <span className="grow wrap-anywhere">{rotuloDoMotivo ? `${t("Perdido")}: ${rotuloDoMotivo}` : t("Perdido")}</span>
        </div>
      )}
      {!aberto && podeMexer && !confirmandoReabrir && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setConfirmandoReabrir(true)}>
          <ArrowsClockwise size={14} aria-hidden /> {t("Reabrir")}
        </Button>
      )}
      {confirmandoReabrir && (
        // Confirmação DENTRO do componente (quadro DS), e não em janela modal.
        <div className="rounded-lg border border-border-strong bg-surface-elevated p-3.5" data-testid="confirmar-reabrir">
          <b className="text-ui">{t("Reabrir como negócio novo?")}</b>
          <p className="mt-1 text-label font-normal text-text-muted">
            {t("Cria um negócio novo com o mesmo contato e guarda a ligação com este. O negócio encerrado fica como está, com o motivo dele.")}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmandoReabrir(false)} disabled={retomando}>
              {t("Cancelar")}
            </Button>
            <Button size="sm" onClick={() => void retomar()} disabled={retomando}>
              {t("Reabrir")}
            </Button>
          </div>
        </div>
      )}

      <ResponsavelDoNegocio lead={lead} contactId={contactId} podeMexer={podeMexer} onMudou={onMudou} />

      {aberto && podeMexer && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="px-1.5 hover:border-success-fg hover:bg-success-bg hover:text-success-fg"
            disabled={ganhar.isPending}
            onClick={marcarGanho}
          >
            <Check size={14} aria-hidden /> {t("Ganho")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={perdendo}
            className={cn(
              "px-1.5 hover:border-error hover:bg-error-bg hover:text-error-fg",
              perdendo && "border-error bg-error-bg text-error-fg",
            )}
            onClick={() => { setTrocandoDeFunil(false); setPerdendo((v) => !v); }}
          >
            <X size={14} aria-hidden /> {t("Perdido")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={trocandoDeFunil}
            className={cn("px-1.5", trocandoDeFunil && "border-accent bg-accent-soft text-accent-text")}
            onClick={() => { setPerdendo(false); setTrocandoDeFunil((v) => !v); }}
          >
            <Funnel size={14} aria-hidden /> {t("Outro funil")}
          </Button>
        </div>
      )}

      {/* Perder e trocar de funil NO PAINEL (`.lead-form`), com os mesmos
          formulários das janelas do quadro. Releitura só quando gravou. */}
      {perdendo && (
        <div className="space-y-3 rounded-lg border border-[color-mix(in_oklch,var(--color-error)_40%,var(--color-border))] bg-error-bg p-3.5" data-testid="perda-no-painel">
          <b className="text-ui">{t("Por que perdeu?")}</b>
          {lead.motivo_de_perda_obrigatorio === false && (
            <p className="text-label font-normal text-text-muted" data-testid="perda-motivo-opcional">
              {t("Este funil não exige motivo. Informar ajuda a melhorar o funil.")}
            </p>
          )}
          <FormularioDePerda
            leadId={lead.id}
            pipelineId={lead.pipeline_id}
            motivosDoFunil={lead.motivos_de_perda}
            motivoObrigatorio={lead.motivo_de_perda_obrigatorio !== false}
            onCancelar={() => setPerdendo(false)}
            onConcluido={(atualizado) => {
              setPerdendo(false);
              onMudou();
              avisarComDesfazer(t("Negócio marcado como perdido."), t("Desfazer"), () =>
                voltarParaAEtapa(atualizado?.updated_at),
              );
            }}
            rodape={(botoes) => <div className="flex justify-end gap-2">{botoes}</div>}
          />
        </div>
      )}
      {trocandoDeFunil && (
        <div className="space-y-3 rounded-lg border border-border-strong bg-surface-elevated p-3.5" data-testid="outro-funil-no-painel">
          <b className="text-ui">{t("Levar para outro funil")}</b>
          <p className="text-label font-normal text-text-muted" data-testid="outro-funil-explica">
            {t("O negócio continua no funil de destino, na primeira etapa aberta. Aqui ele fica encerrado como transferido, com a ligação para o novo.")}
          </p>
          <FormularioDeOutroFunil
            leadId={lead.id}
            pipelineId={lead.pipeline_id}
            onCancelar={() => setTrocandoDeFunil(false)}
            onConcluido={(resultado) => {
              setTrocandoDeFunil(false);
              onMudou();
              const novo = resultado?.lead?.id;
              avisarComDesfazer(t("Negócio levado para outro funil."), t("Desfazer"), async () => {
                // Desfazer: a origem volta à etapa de antes e o negócio novo sai.
                // Nessa ordem: se a origem não puder reabrir, o novo fica.
                await voltarParaAEtapa(resultado?.origem?.updated_at);
                if (novo) await apiClient.post("/api/v1/leads/bulk", { action: "delete", lead_ids: [novo], params: {} });
              });
            }}
            rodape={(botoes) => <div className="flex justify-end gap-2">{botoes}</div>}
          />
        </div>
      )}
    </div>
  );
}
