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

interface Props {
  fecharAberto: boolean;
  onFecharAberto: (v: boolean) => void;
  onFechar: () => void;
  arquivarAberto: boolean;
  onArquivarAberto: (v: boolean) => void;
  onArquivar: () => void;
  encerrada: boolean;
}

/**
 * As duas confirmações destrutivas do cabeçalho (doutrina
 * `destrutivo-pede-confirmacao.md`): o ícone só ABRE o diálogo, a mutação só
 * dispara no clique de dentro dele.
 */
export function ConfirmacoesDaConversa({
  fecharAberto,
  onFecharAberto,
  onFechar,
  arquivarAberto,
  onArquivarAberto,
  onArquivar,
  encerrada,
}: Props) {
  const t = useT();
  return (
    <>
      <AlertDialog open={fecharAberto} onOpenChange={onFecharAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Fechar esta conversa?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={onFechar}>{t("Fechar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação diz o que ACONTECE, e isso depende do estado.
          `fn_conversation_set_status` trata `archived` como terminal: encerra o
          atendimento e, com isso, desfaz a pausa do automático. Quem lesse
          "arquivar = tirar da vista" encerraria o atendimento sem saber, e o
          robô voltaria no próximo "oi". Por isso a descrição só aparece quando
          a conversa ainda não está encerrada: aí arquivar só muda o lugar dela. */}
      <AlertDialog open={arquivarAberto} onOpenChange={onArquivarAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar esta conversa?")}</AlertDialogTitle>
            {!encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={onArquivar}>{t("Arquivar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
