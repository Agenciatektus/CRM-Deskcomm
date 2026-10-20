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
import { useAcaoPorNegocio } from "@/hooks/kanban/useAcaoPorNegocio";
import { apiClient } from "@/lib/api/client";
import { adiarAcao } from "@/lib/ui/aviso-com-desfazer";

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
  pipelineId,
  onConcluido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Só os ainda não ganhos (ganhar de novo não é ação). */
  ids: string[];
  pipelineId: string;
  onConcluido: () => void;
}) {
  const t = useT();
  const porNegocio = useAcaoPorNegocio(pipelineId);
  const n = ids.length;

  const confirmar = () => {
    const alvo = [...ids];
    adiarAcao(
      (s) => `${t("Marcando os selecionados como ganhos")} (${s} s)`,
      t("Desfazer"),
      async () => {
        await porNegocio(
          alvo,
          (leadId) => apiClient.post(`/api/v1/leads/${leadId}/win`, {}),
          (feitos) => `${feitos} ${t(feitos === 1 ? "marcado como ganho." : "marcados como ganhos.")}`,
        );
        onConcluido();
      },
    );
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
