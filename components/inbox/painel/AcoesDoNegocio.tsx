"use client";

import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { FormularioDePerda } from "@/components/kanban/LoseLeadDialog";
import { FormularioDeOutroFunil } from "@/components/kanban/MoveToOtherPipelineDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import { CANONICAL_LOST_REASONS, rotuloDoMotivoDePerda } from "@/lib/schemas/leads";
import { Check, ArrowsClockwise, Funnel, X } from "@/lib/ui/icons";

import { ResponsavelDoNegocio } from "./ResponsavelDoNegocio";
import type { LeadRow } from "./tipos";

type Confirmacao = "ganho" | "reabrir" | null;

/**
 * As ações do negócio no painel da conversa (fase 3.4 do visual v2).
 *
 * ⚠️ NENHUMA REGRA NOVA. Cada botão chama a porta que o quadro já usa:
 *   - Ganho → `useWinLead` (`/win`), o mesmo do menu do card;
 *   - Perdido → `FormularioDePerda` (o da janela do quadro, no painel) com os motivos DO FUNIL (vêm no `crm-summary`;
 *     o Inbox não tem o cache do quadro, ver `useMotivosDePerdaDoFunil`);
 *   - Outro funil → `FormularioDeOutroFunil` (`/clone`, o da janela do quadro): o servidor aplica a
 *     P-01 (funil é imutável, troca é clone) e fecha a origem com o motivo
 *     canônico da P-03; a tela só escolhe o destino;
 *   - Reabrir → `/retomar`, que cria o negócio NOVO e não toca o encerrado.
 *
 * Confirmação onde o gesto não se desfaz pela tela: ganhar fecha o negócio (e
 * num funil `reabertura = novo_negocio` voltar atrás vira outro negócio), e
 * retomar cria um registro. Perder e trocar de funil já são formulários com
 * confirmar no próprio formulário. "Desfazer" só existe no responsável, o único gesto que um segundo
 * PATCH devolve exatamente ao estado de antes.
 */
export function AcoesDoNegocio({ lead, contactId, leitura, onMudou }: {
  lead: LeadRow;
  contactId: string | null;
  leitura: boolean;
  onMudou: () => void;
}) {
  const t = useT();
  // A MESMA permissão que as rotas exigem (`requireRole("agent")`): oferecer a
  // quem o servidor recusaria seria prometer o que não se cumpre.
  const podeMexer = usePermission("pipeline.move_card") && !leitura;
  const ganhar = useWinLead(lead.pipeline_id);
  const [confirmar, setConfirmar] = useState<Confirmacao>(null);
  const [perdendo, setPerdendo] = useState(false);
  const [trocandoDeFunil, setTrocandoDeFunil] = useState(false);
  const [retomando, setRetomando] = useState(false);

  const aberto = lead.status === "open";
  const motivo = lead.lost_reason ?? null;
  const rotuloDoMotivo = motivo
    ? (CANONICAL_LOST_REASONS as readonly string[]).includes(motivo) ? t(rotuloDoMotivoDePerda(motivo)) : motivo
    : null;

  async function retomar() {
    setRetomando(true);
    try {
      // Sem `stage_id`: o servidor escolhe a primeira etapa aberta do funil, a
      // mesma decisão do clone. Um seletor aqui duplicaria essa régua.
      await apiClient.post(`/api/v1/leads/${lead.id}/retomar`, {});
      toast.success(t("Negócio retomado como novo."));
      setConfirmar(null);
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
        <div className="flex items-center gap-2 rounded-md bg-success-bg px-2.5 py-2 text-xs font-medium text-success-fg">
          <Check size={14} aria-hidden /> <span className="grow">{t("Negócio ganho")}</span>
        </div>
      )}
      {lead.status === "lost" && (
        <div className="flex items-center gap-2 rounded-md bg-error-bg px-2.5 py-2 text-xs font-medium text-error-fg">
          <X size={14} aria-hidden />
          <span className="grow wrap-anywhere">{rotuloDoMotivo ? `${t("Perdido")}: ${rotuloDoMotivo}` : t("Perdido")}</span>
        </div>
      )}
      {!aberto && podeMexer && (
        <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => setConfirmar("reabrir")}>
          <ArrowsClockwise size={14} className="mr-1" aria-hidden /> {t("Reabrir")}
        </Button>
      )}

      <ResponsavelDoNegocio lead={lead} contactId={contactId} podeMexer={podeMexer} onMudou={onMudou} />

      {aberto && podeMexer && !perdendo && !trocandoDeFunil && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant="outline" className="h-8 px-1.5 text-xs hover:border-success hover:bg-success-bg hover:text-success-fg" disabled={ganhar.isPending} onClick={() => setConfirmar("ganho")}>
            <Check size={14} className="mr-1" aria-hidden /> {t("Ganho")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-1.5 text-xs hover:border-error hover:bg-error-bg hover:text-error-fg" onClick={() => setPerdendo(true)}>
            <X size={14} className="mr-1" aria-hidden /> {t("Perdido")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-1.5 text-xs" onClick={() => setTrocandoDeFunil(true)}>
            <Funnel size={14} className="mr-1" aria-hidden /> {t("Outro funil")}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmar !== null} onOpenChange={(v) => { if (!v) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "ganho" ? t("Marcar este negócio como ganho?") : t("Reabrir como negócio novo?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "ganho"
                ? t("O negócio sai das etapas abertas e conta como venda no funil.")
                : t("Cria um negócio novo com o mesmo contato e guarda a ligação com este. O negócio encerrado fica como está, com o motivo dele.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            {/* `preventDefault`: o Action fecharia a janela ANTES de o servidor
                responder, e um erro chegaria sobre uma tela que já diz pronto. */}
            <AlertDialogAction
              disabled={ganhar.isPending || retomando}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar === "reabrir") return void retomar();
                ganhar.mutate(
                  { leadId: lead.id },
                  {
                    onSuccess: () => {
                      toast.success(t("Negócio marcado como ganho."));
                      setConfirmar(null);
                      onMudou();
                    },
                  },
                );
              }}
            >
              {confirmar === "ganho" ? t("Marcar como ganho") : t("Reabrir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* P18 e P19: perder e trocar de funil NO PAINEL, e não numa janela por
          cima dele. Os formulários são os mesmos das janelas do quadro (mesmas
          rotas, mesmos motivos do funil, mesma validação); só a moldura muda.
          Releitura só quando gravou (`onConcluido`): cancelar não mudou nada. */}
      {perdendo && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-3" data-testid="perda-no-painel">
          <p className="text-xs font-semibold text-text">{t("Marcar como perdido")}</p>
          {lead.motivo_de_perda_obrigatorio === false && (
            <p className="text-xs text-text-muted" data-testid="perda-motivo-opcional">
              {t("Este funil não exige motivo. Informar ajuda a melhorar o funil.")}
            </p>
          )}
          <FormularioDePerda
            leadId={lead.id}
            pipelineId={lead.pipeline_id}
            motivosDoFunil={lead.motivos_de_perda}
            motivoObrigatorio={lead.motivo_de_perda_obrigatorio !== false}
            onCancelar={() => setPerdendo(false)}
            onConcluido={() => {
              setPerdendo(false);
              onMudou();
            }}
            rodape={(botoes) => <div className="flex justify-end gap-2">{botoes}</div>}
          />
        </div>
      )}
      {trocandoDeFunil && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-3" data-testid="outro-funil-no-painel">
          <p className="text-xs font-semibold text-text">{t("Levar para outro funil")}</p>
          <FormularioDeOutroFunil
            leadId={lead.id}
            pipelineId={lead.pipeline_id}
            onCancelar={() => setTrocandoDeFunil(false)}
            onConcluido={() => {
              setTrocandoDeFunil(false);
              onMudou();
            }}
            rodape={(botoes) => <div className="flex justify-end gap-2">{botoes}</div>}
          />
        </div>
      )}
    </div>
  );
}
