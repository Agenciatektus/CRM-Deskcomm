"use client";

import { useState } from "react";

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
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { useTransferConversation } from "@/hooks/inbox/useTransferConversation";

/**
 * A CONFIRMAÇÃO DA TRANSFERÊNCIA PELO MENU (revisão do Cassio, P1).
 *
 * Escolher o nome no submenu só ABRE esta janela: um clique errado na lista de
 * atendentes tirava a conversa de quem atendia sem volta pela tela. Mesmo
 * comportamento do `TransferirPopover` do cabeçalho: motivo opcional (até 500
 * caracteres, aparado; vazio não vai) e a rota é a mesma `POST /transfer`.
 * Cancelar ou Esc não chama nada.
 */
export function DialogoDeTransferir({ conversationId, destino, onFechar }: {
  conversationId: string;
  destino: { userId: string; nome: string };
  onFechar: () => void;
}) {
  const t = useT();
  const transferir = useTransferConversation();
  const [motivo, setMotivo] = useState("");

  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`${t("Transferir para")} ${destino.nome}?`}</AlertDialogTitle>
          <AlertDialogDescription>{t("Quem recebe passa a responder esta conversa.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          placeholder={t("Motivo (opcional)")}
          aria-label={t("Motivo (opcional)")}
          className="h-9 text-sm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={transferir.isPending}
            onClick={() =>
              transferir.mutate({
                conversation_id: conversationId,
                to_user_id: destino.userId,
                reason: motivo.trim() || undefined,
              })
            }
          >
            {t("Transferir")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
