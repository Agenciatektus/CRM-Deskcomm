"use client";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  apagando: boolean;
  setApagando: (aberto: boolean) => void;
  ocultando: boolean;
  setOcultando: (aberto: boolean) => void;
  ocupado: boolean;
  setOcupado: (ocupado: boolean) => void;
  onApagar?: () => Promise<void>;
  onOcultar?: () => Promise<void>;
}

/**
 * As duas confirmações destrutivas da bolha: apagar para todos e ocultar no CRM.
 *
 * Saíram de `MessageBubble.tsx` na divisão da fase 3.5 sem mudar comportamento:
 * a confirmação fica aberta quando o canal recusa (o hook já mostra o erro), e
 * `ocupado` trava os dois botões enquanto a chamada está no ar.
 */
export function ConfirmacoesDaBolha({
  apagando, setApagando, ocultando, setOcultando, ocupado, setOcupado, onApagar, onOcultar,
}: Props) {
  const t = useT();
  return (
    <>
      <AlertDialog open={apagando} onOpenChange={setApagando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Apagar mensagem para todos?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("O WhatsApp tentará remover esta mensagem também para o cliente.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel>
            <Button variant="destructive" disabled={ocupado} onClick={async () => {
              if (!onApagar) return;
              setOcupado(true);
              try { await onApagar(); setApagando(false); }
              catch { /* Mantém a confirmação aberta se o canal recusar. */ }
              finally { setOcupado(false); }
            }}>{t("Apagar para todos")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={ocultando} onOpenChange={setOcultando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Ocultar esta mensagem no CRM?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("A mensagem continua no WhatsApp do cliente e no registro da empresa. Um gestor pode restaurá-la aqui.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel>
            <Button variant="destructive" disabled={ocupado} onClick={async () => {
              if (!onOcultar) return;
              setOcupado(true);
              try { await onOcultar(); setOcultando(false); }
              catch { /* O hook já informa a falha; preservar a confirmação. */ }
              finally { setOcupado(false); }
            }}>{t("Ocultar no CRM")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
