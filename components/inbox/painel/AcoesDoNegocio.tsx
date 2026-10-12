"use client";

import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { FormularioDePerda } from "@/components/kanban/LoseLeadDialog";
import { FormularioDeOutroFunil } from "@/components/kanban/MoveToOtherPipelineDialog";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useArmado } from "@/hooks/ui/useArmado";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { apiClient } from "@/lib/api/client";
import { CANONICAL_LOST_REASONS, rotuloDoMotivoDePerda } from "@/lib/schemas/leads";
import { adiarAcao } from "@/lib/ui/aviso-com-desfazer";
import { Check, ArrowsClockwise, Funnel, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { ResponsavelDoNegocio } from "./ResponsavelDoNegocio";
import type { LeadRow } from "./tipos";

/** O que está segurado pelo aviso de 5 s, mostrado de forma otimista. */
type Pendente = "ganho" | "perda" | "troca" | null;

/**
 * As ações do negócio no painel da conversa, no desenho do quadro DS ("Negócio").
 *
 * ⚠️ NENHUMA REGRA NOVA: cada botão chama a porta que o quadro já usa (`/win`,
 * `/lose` com os motivos DO FUNIL e o motivo opcional por funil da 9044, `/clone`
 * para outro funil, `/retomar` para reabrir).
 *
 * GANHO, PERDA E TROCA DE FUNIL SÃO ADIADOS (P1 do Cassio na #169): as três
 * rotas disparam eventos com efeito FORA do CRM na hora (`lead.won` vira
 * conversão de anúncio para a Meta/Google; `lead.won` e `lead.lost` mexem nas
 * saídas da cadência e no push; o `/clone` cria o negócio e roda as automações
 * do funil de destino). Mover de volta não desfaz nada disso. Por isso o aviso
 * SEGURA a rota por 5 s (`adiarAcao`): Desfazer cancela sem chamar nada, e a
 * tela mostra o estado otimista enquanto isso. Se a página fechar dentro dos
 * 5 s, a ação NÃO acontece. Ganho continua num clique, sem janela.
 * Reabrir cria um registro, e por isso pede confirmação DENTRO do painel.
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
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false);
  const [perdendo, setPerdendo] = useState(false);
  const [trocandoDeFunil, setTrocandoDeFunil] = useState(false);
  const [retomando, setRetomando] = useState(false);
  const [pendente, setPendente] = useState<Pendente>(null);

  const aberto = lead.status === "open" && pendente === null;
  const motivo = lead.lost_reason ?? null;
  const rotuloDoMotivo = motivo
    ? (CANONICAL_LOST_REASONS as readonly string[]).includes(motivo) ? t(rotuloDoMotivoDePerda(motivo)) : motivo
    : null;

  /**
   * Segura a gravação por 5 s. Quando o tempo acaba, grava e relê; se falhar,
   * o estado otimista volta (o erro aparece pelo hook da rota).
   */
  function segurar(tipo: Exclude<Pendente, null>, mensagem: string, gravar: () => Promise<unknown>) {
    setPendente(tipo);
    adiarAcao(
      mensagem,
      t("Desfazer"),
      () =>
        gravar()
          .then(() => onMudou())
          .catch(() => undefined)
          .finally(() => setPendente(null)),
      () => setPendente(null),
    );
  }

  function marcarGanho() {
    segurar("ganho", t("Negócio ganho."), () => ganhar.mutateAsync({ leadId: lead.id }));
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
      {(lead.status === "won" || pendente === "ganho") && (
        <div className="flex items-center gap-2 rounded-field bg-success-bg px-3 py-2.25 text-[13.5px] font-semibold text-success-fg">
          <Check size={14} aria-hidden /> <span className="grow">{t("Negócio ganho")}</span>
        </div>
      )}
      {(lead.status === "lost" || pendente === "perda") && (
        <div className="flex items-center gap-2 rounded-field bg-error-bg px-3 py-2.25 text-[13.5px] font-semibold text-error-fg">
          <X size={14} aria-hidden />
          <span className="grow wrap-anywhere">{rotuloDoMotivo ? `${t("Perdido")}: ${rotuloDoMotivo}` : t("Perdido")}</span>
        </div>
      )}
      {pendente === "troca" && (
        <div className="flex items-center gap-2 rounded-field bg-surface-elevated px-3 py-2.25 text-[13.5px] font-semibold text-text-muted">
          <Funnel size={14} aria-hidden /> <span className="grow">{t("Levado para outro funil")}</span>
        </div>
      )}
      {!aberto && pendente === null && podeMexer && !confirmandoReabrir && (
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
          <BotoesDaConfirmacao
            ocupado={retomando}
            onCancelar={() => setConfirmandoReabrir(false)}
            onConfirmar={() => void retomar()}
            rotulo={t("Reabrir")}
          />
        </div>
      )}

      <ResponsavelDoNegocio lead={lead} contactId={contactId} podeMexer={podeMexer} onMudou={onMudou} />

      {aberto && podeMexer && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="px-1.5 hover:border-success-fg hover:bg-success-bg hover:text-success-fg"
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
            adiar={(gravar) => segurar("perda", t("Negócio marcado como perdido."), gravar)}
            onConcluido={() => setPerdendo(false)}
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
            adiar={(gravar) => segurar("troca", t("Negócio levado para outro funil."), gravar)}
            onConcluido={() => setTrocandoDeFunil(false)}
            rodape={(botoes) => <div className="flex justify-end gap-2">{botoes}</div>}
          />
        </div>
      )}
    </div>
  );
}

/** Cancelar e confirmar da confirmação dentro do painel, armados depois de 300 ms. */
function BotoesDaConfirmacao({ ocupado, onCancelar, onConfirmar, rotulo }: {
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
  rotulo: string;
}) {
  const t = useT();
  const armado = useArmado();
  return (
    <div className="mt-3 flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={onCancelar} disabled={ocupado || !armado}>
        {t("Cancelar")}
      </Button>
      <Button size="sm" onClick={onConfirmar} disabled={ocupado || !armado}>
        {rotulo}
      </Button>
    </div>
  );
}
