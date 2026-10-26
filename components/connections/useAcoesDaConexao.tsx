"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { AcaoDaConexao, ItemDeConexao } from "@/lib/channels/conexoes-lista";

import { AntiBanSheet } from "./AntiBanSheet";
import { AssistenteConexao } from "./AssistenteConexao";
import { ExcluirCanalDialog, QrDialog } from "./ConnectionsClient";
import { GruposSheet } from "./GruposSheet";
import { usePacingKnobs } from "@/hooks/channels/usePacingKnobs";

const msg = (e: unknown, f: string, t: (x: string) => string) =>
  e instanceof ApiError && e.message ? t(e.message) : t(f);

type Aberto =
  | { tipo: "protecao" | "grupos"; id: string }
  | { tipo: "excluir"; item: ItemDeConexao }
  | { tipo: "qr"; id: string; titulo: string }
  | { tipo: "assistente"; id?: string; nome?: string };

/**
 * Faz as ações de uma conexão e guarda os diálogos (um só para a lista inteira). Reusa o que
 * já existia: pausar/retomar e reconectar chamam as mesmas rotas da tela antiga; excluir,
 * proteção de envio, grupos, QR e assistente são os mesmos componentes.
 */
export function useAcoesDaConexao({
  transporteConfigurado,
  recarregar,
}: {
  transporteConfigurado: boolean;
  recarregar: () => Promise<void>;
}): {
  onAcao: (a: AcaoDaConexao, i: ItemDeConexao) => void;
  abrirAssistente: () => void;
  ocupadoId: string | null;
  dialogos: ReactNode;
} {
  const t = useT();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const pacing = usePacingKnobs().data?.items ?? [];
  const invalidar = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["channel-sessions"] });
    void qc.invalidateQueries({ queryKey: ["pacing-knobs"] });
  }, [qc]);

  const pausar = async (i: ItemDeConexao) => {
    setOcupadoId(i.id);
    try {
      await apiClient.patch(`/api/v1/channel-sessions/${i.id}/disabled`, { disabled: !i.pausado });
      toast.success(i.pausado ? t("Canal reativado.") : t("Canal pausado."));
      invalidar();
    } catch (e) {
      toast.error(msg(e, "Não foi possível mudar o estado do canal.", t));
    } finally {
      setOcupadoId(null);
    }
  };

  const reconectar = async (i: ItemDeConexao) => {
    if (i.nativa) return setAberto({ tipo: "assistente", id: i.id, nome: i.nomeCru ?? "" });
    setOcupadoId(i.id);
    try {
      await apiClient.post(`/api/v1/channel-sessions/${i.id}/reconnect`, {});
      invalidar();
      setAberto({ tipo: "qr", id: i.id, titulo: `${t("Reconectar")} ${i.nome}` });
    } catch (e) {
      toast.error(msg(e, "Não foi possível reconectar.", t));
    } finally {
      setOcupadoId(null);
    }
  };

  const onAcao = (a: AcaoDaConexao, i: ItemDeConexao) => {
    if (a === "pausar" || a === "retomar") void pausar(i);
    else if (a === "reconectar") void reconectar(i);
    else if (a === "excluir") setAberto({ tipo: "excluir", item: i });
    else if (a === "protecao" || a === "grupos") setAberto({ tipo: a, id: i.id });
    else if (a === "continuar") setAberto({ tipo: "assistente", id: i.id, nome: i.nomeCru ?? "" });
  };

  const fechar = () => setAberto(null);
  const dialogos = (
    <>
      {aberto?.tipo === "protecao" && (
        <AntiBanSheet
          item={pacing.find((p) => p.channel_session.id === aberto.id) ?? null}
          canWrite
          onClose={fechar}
        />
      )}
      {aberto?.tipo === "grupos" && <GruposSheet channelId={aberto.id} onClose={fechar} />}
      {aberto?.tipo === "excluir" && (
        <ExcluirCanalDialog
          canal={aberto.item.sessao!}
          onCancel={fechar}
          onDeleted={() => {
            fechar();
            invalidar();
          }}
        />
      )}
      {aberto?.tipo === "qr" && (
        <QrDialog
          sessionId={aberto.id}
          title={aberto.titulo}
          wahaConfigured={transporteConfigurado}
          onClose={fechar}
          onConnected={() => {
            toast.success(t("WhatsApp conectado!"));
            fechar();
            invalidar();
          }}
          onForcePair={async (id) => {
            await apiClient.post(`/api/v1/channel-sessions/${id}/reconnect`, { force: true });
            invalidar();
          }}
        />
      )}
      {aberto?.tipo === "assistente" && (
        <AssistenteConexao
          canalIdInicial={aberto.id}
          nomeInicial={aberto.nome}
          onClose={fechar}
          onAtualizar={() => void recarregar()}
          onConfigurarAgente={(id) =>
            setTimeout(() => document.getElementById(`canal-ia-${id}`)?.scrollIntoView({ block: "center" }), 150)
          }
        />
      )}
    </>
  );
  return { onAcao, abrirAssistente: () => setAberto({ tipo: "assistente" }), ocupadoId, dialogos };
}
