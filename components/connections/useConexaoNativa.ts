"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api/client";

/** Espelha o JSON de `GET /api/v1/channel-sessions/[id]/conexao-nativa`. */
export interface CorpoConexao {
  estado: "gerando" | "aguardando_leitura" | "conectado" | "reconectando" | "erro";
  qr?: string;
  telefone?: string | null;
  mensagem?: string;
  atualizado_em: string;
}

export const POLL_MS = 2500;
export const POLL_MAX_MS = 20_000;

/**
 * Poll do estado da conexao a cada 2,5 s. Para ao conectar e ao desmontar
 * (AbortController). Erro de rede ou 429 recua (dobra o intervalo, teto 20 s) e
 * volta a 2,5 s no primeiro sucesso. Aba oculta nao pergunta.
 */
export function useConexaoNativa(canalId: string, onConectado: () => void) {
  const [corpo, setCorpo] = useState<CorpoConexao | null>(null);
  const [falha, setFalha] = useState(false);
  const [rodada, setRodada] = useState(0);
  const aoConectar = useRef(onConectado);
  useEffect(() => {
    aoConectar.current = onConectado;
  });

  useEffect(() => {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let atraso = POLL_MS;
    const passo = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await apiClient.get<{ data: CorpoConexao }>(
            `/api/v1/channel-sessions/${canalId}/conexao-nativa`,
            { signal: ctl.signal, timeoutMs: 15_000 },
          );
          if (ctl.signal.aborted) return;
          setCorpo(r.data);
          setFalha(false);
          atraso = POLL_MS;
          if (r.data.estado === "conectado") {
            aoConectar.current();
            return;
          }
        } catch {
          if (ctl.signal.aborted) return;
          setFalha(true);
          atraso = Math.min(atraso * 2, POLL_MAX_MS);
        }
      }
      timer = setTimeout(() => void passo(), atraso);
    };
    void passo();
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [canalId, rodada]);

  const tentarAgora = useCallback(() => {
    setFalha(false);
    setRodada((v) => v + 1);
  }, []);

  return { corpo, falha, tentarAgora };
}
