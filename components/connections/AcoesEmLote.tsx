"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { ResultadoDoLoteDePausa } from "@/app/api/v1/channel-sessions/disabled/route";
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
import type { ItemDeConexao } from "@/lib/channels/conexoes-lista";
import { Pause, Play } from "@/lib/ui/icons";

import { frasesDoLoteDePausa } from "./ConnectionsClient";

/**
 * Pausar todas / Retomar todas (#2387): uma requisição para a lista toda, na rota que já
 * existia, com a conta que a API devolve no aviso. Pausar muda o atendimento de TODOS os
 * canais de uma vez, então pede confirmação dizendo quantos são.
 */
export function AcoesEmLote({ itens }: { itens: ItemDeConexao[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [pedido, setPedido] = useState<"pausar" | "retomar" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const canais = itens.filter((i) => i.fonte === "canal");
  const paraPausar = canais.filter((i) => !i.pausado);
  const paraRetomar = canais.filter((i) => i.pausado);
  const alvo = pedido === "pausar" ? paraPausar : paraRetomar;

  const confirmar = async () => {
    setOcupado(true);
    try {
      const res = await apiClient.patch<{ data: ResultadoDoLoteDePausa }>("/api/v1/channel-sessions/disabled", {
        disabled: pedido === "pausar",
        ids: alvo.map((i) => i.id),
      });
      const frases = frasesDoLoteDePausa(res.data, t);
      if (frases.erro) toast.error(frases.erro);
      else if (frases.sucesso) toast.success(frases.sucesso);
    } catch {
      toast.error(t("Não foi possível mudar o estado dos canais."));
    } finally {
      setOcupado(false);
      setPedido(null);
      void qc.invalidateQueries({ queryKey: ["channel-sessions"] });
      void qc.invalidateQueries({ queryKey: ["pacing-knobs"] });
    }
  };

  return (
    <>
      {paraPausar.length > 0 && (
        <Button variant="outline" onClick={() => setPedido("pausar")}>
          <Pause size={14} aria-hidden />
          {t("Pausar todas")} ({paraPausar.length})
        </Button>
      )}
      {paraRetomar.length > 0 && (
        <Button variant="outline" onClick={() => setPedido("retomar")}>
          <Play size={14} aria-hidden />
          {t("Retomar todas")} ({paraRetomar.length})
        </Button>
      )}
      <AlertDialog open={pedido !== null} onOpenChange={(o) => !o && !ocupado && setPedido(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pedido === "pausar"
                ? `${t("Pausar")} ${alvo.length} ${t("canais?")}`
                : `${t("Retomar")} ${alvo.length} ${t("canais?")}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pedido === "pausar"
                ? t("Nenhuma conversa nova entra, a IA não responde e não há follow-up nestes canais até você retomar. Nada é apagado.")
                : t("Os canais voltam a receber conversas e a IA volta a responder.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Voltar")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={ocupado}
              onClick={(e) => {
                e.preventDefault();
                void confirmar();
              }}
            >
              {pedido === "pausar" ? t("Pausar todas") : t("Retomar todas")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
