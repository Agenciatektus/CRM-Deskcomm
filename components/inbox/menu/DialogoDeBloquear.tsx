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
import { useBlockContact } from "@/hooks/contacts/useBlockContact";
import { useT } from "@/hooks/i18n/useT";

/**
 * A CONFIRMAÇÃO DE BLOQUEAR O CONTATO PELO MENU (9042, frente B).
 *
 * Bloquear vale para a empresa inteira (nenhum envio sai mais, nem da IA, nem
 * de campanha), e desfazer é só do admin: por isso a janela, ao contrário de
 * fixar e silenciar. Motivo opcional (até 280 caracteres, aparado; vazio não
 * vai). Cancelar ou Esc não chama nada.
 */
export function DialogoDeBloquear({ contactId, nome, onFechar }: {
  contactId: string;
  nome: string;
  onFechar: () => void;
}) {
  const t = useT();
  const bloquear = useBlockContact();
  const [motivo, setMotivo] = useState("");

  return (
    <AlertDialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`${t("Bloquear")} ${nome}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Nenhuma mensagem sai mais para este contato, nem da IA nem de campanhas. Só um admin desbloqueia.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={280}
          placeholder={t("Motivo (opcional)")}
          aria-label={t("Motivo (opcional)")}
          className="h-9 text-sm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={bloquear.isPending}
            onClick={() => bloquear.mutate({ contactId, motivo: motivo.trim() || undefined })}
          >
            {t("Bloquear")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
