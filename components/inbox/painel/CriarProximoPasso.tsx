"use client";

import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";

import { NovaTarefaRapida, type PedidoDeTarefa } from "./NovaTarefaRapida";
import { useTarefasDoContato } from "./useTarefasDoContato";

/**
 * O ÚNICO jeito de marcar próximo passo no painel: criar a TAREFA.
 *
 * Decisão do Peterson (revisão do @Cassio_SecRev, P2): próximo passo é tarefa
 * em `crm_tasks`. O bloco do Próximo passo e o botão "Marcar próximo passo" de
 * cada demanda usam ESTA peça, para não existirem duas verdades (o texto livre
 * `demandas.proximo_passo` e a tarefa) sobre o que fazer a seguir.
 */
export function CriarProximoPasso({ contactId, leadId, usuarioId, onCriado }: {
  contactId: string | null;
  /** O negócio ABERTO em foco, para a tarefa nascer presa a ele. */
  leadId: string | null;
  usuarioId: string;
  onCriado?: () => void;
}) {
  const t = useT();
  const { criar } = useTarefasDoContato(contactId);
  const membrosQ = useAssignableMembers(!!contactId);
  const membros = Array.isArray(membrosQ.data) ? membrosQ.data : [];

  async function criarTarefa(pedido: PedidoDeTarefa): Promise<boolean> {
    try {
      await criar.mutateAsync({ ...pedido, priority: "medium", status: "pending", contact_id: contactId, lead_id: leadId });
      toast.success(t("Próximo passo criado."));
      onCriado?.();
      return true;
    } catch {
      // O toast de erro já saiu pelo hook; o formulário fica com o que foi digitado.
      return false;
    }
  }

  return <NovaTarefaRapida usuarioId={usuarioId} membros={membros} salvando={criar.isPending} onCriar={criarTarefa} />;
}
