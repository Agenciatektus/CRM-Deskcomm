"use client";
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
import { useT } from "@/hooks/i18n/useT";
import { agendarNoLote, useAcaoPorNegocio } from "@/hooks/kanban/useAcaoPorNegocio";
import { apiClient } from "@/lib/api/client";

/**
 * "Marcar como ganho" em LOTE — decisão do Peterson (20/10/2026), que revê a
 * proibição da #180. Ganhar dispara `lead.won`, que pode sair como conversão de
 * venda nas etapas configuradas; por isso a ação tem DUAS travas antes de
 * qualquer efeito externo:
 *
 *   1. a confirmação (AlertDialog do DS), que diz quantos negócios e o evento;
 *   2. o MESMO Desfazer adiado de 5 s do ganho individual (`adiarAcao`): nada
 *      é chamado antes do fim do aviso.
 *
 * Cada negócio vai pela rota do ganho individual (`POST /leads/[id]/win` →
 * `encerraDemanda`), com os campos exigidos da etapa de ganho; quem falha é
 * contado no fim, quem ganhou fica ganho.
 */
export function GanhoEmLote({
  open,
  onOpenChange,
  ids,
  ignorados,
  pipelineId,
  onConcluido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Só os ABERTOS (P2 do Cassio na #220): encerrado não é ganho, é Reabrir. */
  ids: string[];
  /** Quantos selecionados ficaram de fora por já estarem encerrados. */
  ignorados: number;
  pipelineId: string;
  onConcluido: () => void;
}) {
  const t = useT();
  const porNegocio = useAcaoPorNegocio(pipelineId);
  const n = ids.length;

  const confirmar = () => {
    const alvo = [...ids];
    const agendado = agendarNoLote(
      pipelineId,
      (s) => `${t("Marcando os selecionados como ganhos")} (${s} s)`,
      t("Desfazer"),
      async () => {
        await porNegocio(
          alvo,
          (leadId) => apiClient.post(`/api/v1/leads/${leadId}/win`, {}),
          (feitos) => `${feitos} ${t(feitos === 1 ? "marcado como ganho." : "marcados como ganhos.")}`,
        );
      },
    );
    // A seleção sai na hora: nos 5 s não há o que reconfirmar.
    if (agendado) onConcluido();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {n === 1 ? t("Marcar 1 negócio como ganho?") : `${t("Marcar como ganho")}: ${n} ${t("negócios")}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Cada negócio pode disparar o evento de venda (conversão) nas etapas configuradas. Você ainda terá 5 segundos para desfazer.",
            )}
            {ignorados > 0 &&
              ` ${ignorados} ${t(ignorados === 1 ? "ignorado por já estar encerrado; use Reabrir." : "ignorados por já estarem encerrados; use Reabrir.")}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmar} disabled={n === 0}>
            {t("Marcar como ganho")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
