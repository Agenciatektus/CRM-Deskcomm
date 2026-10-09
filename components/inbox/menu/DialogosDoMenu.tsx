"use client";

import { useQueryClient } from "@tanstack/react-query";

import { LoseLeadDialog } from "@/components/kanban/LoseLeadDialog";
import { MoveToOtherPipelineDialog } from "@/components/kanban/MoveToOtherPipelineDialog";
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
import { useArchiveConversation, useCloseConversation } from "@/hooks/inbox/useCloseConversation";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { avisarQueOCrmDoContatoMudou } from "@/lib/inbox/releitura-do-contato";

import { DialogoDeBloquear } from "./DialogoDeBloquear";
import { DialogoDeTransferir } from "./DialogoDeTransferir";
import { chaveDoResumoDoMenu, type DialogoDoFunil } from "./SubmenuDoFunil";

export type DialogoDoMenu =
  | { tipo: "fechar" | "arquivar"; conversation: ConversationWithContact }
  | { tipo: "transferir"; conversationId: string; destino: { userId: string; nome: string } }
  | { tipo: "bloquear"; contactId: string; nome: string }
  | (DialogoDoFunil & { contactId: string });

/**
 * As janelas que o menu abre e que sobrevivem a ele fechar.
 *
 * Fechar e Arquivar repetem a confirmação do cabeçalho PALAVRA POR PALAVRA (os
 * textos são as mesmas chaves do dicionário): a mesma ação não pode pedir
 * confirmação num lugar e não pedir no outro, nem prometer consequências
 * diferentes. A descrição do Arquivar só aparece com o atendimento aberto, pelo
 * motivo escrito no cabeçalho: arquivar encerra o atendimento.
 */
export function DialogosDoMenu({ dialogo, onFechar }: {
  dialogo: DialogoDoMenu | null;
  onFechar: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const fechar = useCloseConversation();
  const arquivar = useArchiveConversation();
  const aoMudar = (open: boolean) => {
    if (!open) onFechar();
  };

  if (!dialogo) return null;

  if (dialogo.tipo === "transferir") {
    return <DialogoDeTransferir conversationId={dialogo.conversationId} destino={dialogo.destino} onFechar={onFechar} />;
  }

  if (dialogo.tipo === "bloquear") {
    return <DialogoDeBloquear contactId={dialogo.contactId} nome={dialogo.nome} onFechar={onFechar} />;
  }

  if ("lead" in dialogo) {
    const { lead, contactId } = dialogo;
    const reler = () => {
      void qc.invalidateQueries({ queryKey: chaveDoResumoDoMenu(contactId) });
      avisarQueOCrmDoContatoMudou(contactId);
    };
    return dialogo.tipo === "perder" ? (
      <LoseLeadDialog
        open
        onOpenChange={aoMudar}
        aoConcluir={reler}
        leadId={lead.id}
        pipelineId={lead.pipeline_id}
        motivosDoFunil={lead.motivos_de_perda}
      />
    ) : (
      <MoveToOtherPipelineDialog open onOpenChange={aoMudar} aoConcluir={reler} leadId={lead.id} pipelineId={lead.pipeline_id} />
    );
  }

  const { conversation } = dialogo;
  const encerrada = ["closed", "archived", "resolved"].includes(conversation.status);
  const ehFechar = dialogo.tipo === "fechar";
  const args = { conversation_id: conversation.id, expected_revision: conversation.service_revision };

  return (
    <AlertDialog open onOpenChange={aoMudar}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ehFechar ? t("Fechar esta conversa?") : t("Arquivar esta conversa?")}</AlertDialogTitle>
          {ehFechar ? (
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          ) : (
            !encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => (ehFechar ? fechar.mutate(args) : arquivar.mutate(args))}>
            {ehFechar ? t("Fechar") : t("Arquivar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
