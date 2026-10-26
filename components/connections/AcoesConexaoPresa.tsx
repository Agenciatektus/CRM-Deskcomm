"use client";

import { useState } from "react";
import { toast } from "sonner";

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
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/** Estados em que o canal NATIVO ainda nao conectou: so aqui ha o que retomar. */
const PRESOS = ["STARTING", "SCAN_QR_CODE", "FAILED"];

export function conexaoPresa(origem: string | undefined, status: string | null): boolean {
  return origem === "nativa" && !!status && PRESOS.includes(status);
}

/**
 * Continuar (reabre o assistente no passo 3 do MESMO canal) ou cancelar (exclui o
 * canal e libera o numero; o DELETE ja limpa a instancia no FZAP). Cancelar pede
 * confirmacao.
 */
export function AcoesConexaoPresa({
  canalId,
  onContinuar,
  onCancelado,
  onConferir,
}: {
  canalId: string;
  onContinuar: () => void;
  onCancelado: () => void;
  /** Relê o estado antes de confirmar: se o canal já conectou, o pai some com estes botões. */
  onConferir: () => Promise<void>;
}) {
  const t = useT();
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [conferindo, setConferindo] = useState(false);

  const pedirConfirmacao = async () => {
    setConferindo(true);
    await onConferir();
    setConferindo(false);
    setConfirmando(true);
  };

  const cancelar = async () => {
    setCancelando(true);
    try {
      const r = await apiClient.delete<{ data?: { archived?: boolean } }>(`/api/v1/channel-sessions/${canalId}`);
      toast.success(
        r?.data?.archived ? t("Conexão removida. O histórico de conversas continua guardado.") : t("Conexão cancelada."),
      );
      setConfirmando(false);
      onCancelado();
    } catch (e) {
      toast.error(e instanceof Error ? t(e.message) : t("Não foi possível cancelar a conexão."));
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={onContinuar}>
        {t("Continuar conexão")}
      </Button>
      <Button size="sm" variant="outline" disabled={conferindo} onClick={() => void pedirConfirmacao()}>
        {t("Cancelar")}
      </Button>
      <AlertDialog open={confirmando} onOpenChange={(o) => !cancelando && setConfirmando(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Cancelar esta conexão?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O canal sai da lista e o número fica livre. Se houver histórico de conversas, ele é preservado.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>{t("Voltar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelando}
              onClick={(e) => {
                e.preventDefault();
                void cancelar();
              }}
            >
              {t("Cancelar conexão")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
