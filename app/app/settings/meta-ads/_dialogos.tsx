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
import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";

/** Confirmações da tela: desconectar a Meta e trocar por um token que enxerga menos contas. */
export function DialogosDeMetaAds({
  confirmarDesconexao,
  onDesconexao,
  onConfirmarDesconexao,
  reducao,
  onReducao,
  onConfirmarReducao,
  idioma,
}: {
  confirmarDesconexao: boolean;
  onDesconexao: (aberto: boolean) => void;
  onConfirmarDesconexao: () => void;
  reducao: { atuais: number; visiveis: number } | null;
  onReducao: (v: { atuais: number; visiveis: number } | null) => void;
  onConfirmarReducao: (e: React.MouseEvent) => void;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  return (
    <>
      <AlertDialog open={confirmarDesconexao} onOpenChange={onDesconexao}>
        <AlertDialogContent data-testid="meta-confirmar-desconexao">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Desconectar a Meta?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Desconectar apaga o token guardado. A tela de Meta Ads volta a pedir uma conexão, e nenhum dado histórico é perdido, nada é armazenado aqui.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDesconexao(false);
                onConfirmarDesconexao();
              }}
            >
              {t("Desconectar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reducao !== null} onOpenChange={(aberto) => !aberto && onReducao(null)}>
        <AlertDialogContent data-testid="meta-confirmar-reducao">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Este token enxerga menos contas")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Hoje a organização tem {atuais} contas liberadas e o novo token enxerga só {visiveis} delas. Trocar agora pode esconder as demais.")
                .replace("{atuais}", String(reducao?.atuais ?? 0))
                .replace("{visiveis}", String(reducao?.visiveis ?? 0))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                onReducao(null);
                onConfirmarReducao(e);
              }}
            >
              {t("Trocar mesmo assim")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
