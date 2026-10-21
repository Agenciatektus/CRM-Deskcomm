"use client";
import { NovaTarefaRapida, type PedidoDeTarefa } from "@/components/inbox/painel/NovaTarefaRapida";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { toast } from "sonner";

import { AVISO_DE_LOTE_EM_CURSO, agendarNoLote, useAcaoPorNegocio } from "@/hooks/kanban/useAcaoPorNegocio";
import { apiClient } from "@/lib/api/client";
import type { Lead } from "@/lib/types/leads";

/**
 * "Criar tarefa / próximo passo" em LOTE: o MESMO formulário do painel de
 * próximo passo da Inbox (`NovaTarefaRapida`: o quê, quando com os atalhos e
 * responsável) e o MESMO caminho de gravação (`POST /api/v1/tasks`, uma tarefa
 * por negócio, presa a ele e ao contato dele).
 *
 * Responsável padrão: o de CADA negócio (`owner_user_id`); negócio sem dono
 * humano fica com quem criou. A gravação segura o Desfazer de 5 s.
 */
export function responsavelDaTarefa(
  escolhido: string,
  lead: Pick<Lead, "owner_user_id"> | undefined,
  usuarioId: string,
): string {
  return escolhido || lead?.owner_user_id || usuarioId;
}

export function TarefaEmLote({
  open,
  onOpenChange,
  selectedIds,
  leads,
  usuarioId,
  pipelineId,
  onConcluido,
  onDesfeito,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  leads: Lead[];
  usuarioId: string;
  pipelineId: string;
  onConcluido: () => void;
  /** Desfazer nos 5 s: a tela devolve a seleção que limpou ao agendar. */
  onDesfeito: () => void;
}) {
  const t = useT();
  const membrosQ = useAssignableMembers(open);
  const membros = Array.isArray(membrosQ.data) ? membrosQ.data : [];
  const porNegocio = useAcaoPorNegocio(pipelineId);
  const porId = new Map(leads.map((l) => [l.id, l]));

  const criar = async (pedido: PedidoDeTarefa): Promise<boolean> => {
    const ids = [...selectedIds];
    const agendado = agendarNoLote(
      pipelineId,
      (s) => `${t("Definindo o próximo passo nos selecionados")} (${s} s)`,
      t("Desfazer"),
      async () => {
        await porNegocio(
          ids,
          (leadId) =>
            apiClient.post("/api/v1/tasks", {
              title: pedido.title,
              due_date: pedido.due_date,
              assigned_to: responsavelDaTarefa(pedido.assigned_to, porId.get(leadId), usuarioId),
              priority: "medium",
              status: "pending",
              lead_id: leadId,
              contact_id: porId.get(leadId)?.contact_id ?? null,
            }),
          (n) => `${n} ${t(n === 1 ? "tarefa criada." : "tarefas criadas.")}`,
        );
      },
      onDesfeito,
    );
    if (!agendado) {
      // Recusado (outra ação do lote nos 5 s ou rodando): o diálogo fica aberto
      // com o que a pessoa preencheu, e o aviso diz por que nada saiu.
      toast.warning(t(AVISO_DE_LOTE_EM_CURSO));
      return false;
    }
    onOpenChange(false);
    // A seleção sai na hora: reconfirmar nos 5 s criaria a tarefa de novo.
    onConcluido();
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Definir próximo passo")}</DialogTitle>
          <DialogDescription>
            {`${selectedIds.length} ${t(selectedIds.length === 1 ? "negócio recebe a tarefa." : "negócios recebem a tarefa, uma em cada.")}`}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NovaTarefaRapida
            usuarioId={usuarioId}
            membros={membros}
            salvando={false}
            onCriar={criar}
            opcaoDoDono={t("Responsável de cada negócio")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
