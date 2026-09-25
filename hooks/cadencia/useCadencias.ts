"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { CadenceSettings } from "@/lib/cadencia/settings";
import type { FlowGraph } from "@/lib/followup/graph-schema";

/** Rascunho aceita política sem base legal (a publicação a exige). */
export type PoliticaDaCadencia = Omit<CadenceSettings, "legal_basis_ref"> & { legal_basis_ref?: string };

export type GatilhoDaCadencia =
  | { kind: "manual"; cancel_on_reply?: boolean }
  | { kind: "stage_change"; params: { stage_id: string }; cancel_on_reply?: boolean };

export interface Cadencia {
  id: string;
  name: string;
  status: "draft" | "active" | "disabled" | string;
  active_version_id: string | null;
  trigger_config: GatilhoDaCadencia | null;
  pipeline_id: string;
  channel_session_id: string | null;
  cadence_settings: PoliticaDaCadencia | null;
  updated_at: string;
  na_regua?: number;
}

export interface CadenciaDetalhe extends Cadencia {
  draft_graph: FlowGraph | null;
  grafo_no_ar: FlowGraph | null;
}

export interface CotaDoNumero {
  enviados_hoje: number;
  teto_hoje: number | null;
  limite_diario: number | null;
  teto_aquecimento: number | null;
  fuso: string;
  numero_conectado: boolean;
}

export interface ErroDePublicacao {
  node_id: string | null;
  code: string;
  message: string;
}

const chaveDoFunil = (pipelineId: string) => ["cadencias", pipelineId] as const;

export function useCadencias(pipelineId: string) {
  return useQuery({
    queryKey: chaveDoFunil(pipelineId),
    queryFn: async () =>
      (await apiClient.get<{ data: Cadencia[] }>(`/api/v1/cadencias?pipeline_id=${pipelineId}`)).data,
  });
}

export function useCadencia(id: string | null) {
  return useQuery({
    queryKey: ["cadencia", id],
    enabled: id !== null,
    queryFn: async () => (await apiClient.get<{ data: CadenciaDetalhe }>(`/api/v1/cadencias/${id}`)).data,
  });
}

export function useCriarCadencia(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; channel_session_id?: string }) =>
      (await apiClient.post<{ data: Cadencia }>("/api/v1/cadencias", { ...input, pipeline_id: pipelineId })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: chaveDoFunil(pipelineId) }),
  });
}

export function useSalvarCadencia(id: string, pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mudancas: {
      name?: string;
      draft_graph?: FlowGraph;
      trigger_config?: GatilhoDaCadencia;
      cadence_settings?: PoliticaDaCadencia;
      channel_session_id?: string;
    }) => (await apiClient.patch<{ data: CadenciaDetalhe }>(`/api/v1/cadencias/${id}`, mudancas)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cadencia", id] });
      void qc.invalidateQueries({ queryKey: chaveDoFunil(pipelineId) });
    },
  });
}

/** Publicar e desligar são as rotas de fluxo de sempre (a validação da cadência roda lá). */
export function usePublicarCadencia(id: string, pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post(`/api/v1/ai/followup-flows/${id}/publish`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cadencia", id] });
      void qc.invalidateQueries({ queryKey: chaveDoFunil(pipelineId) });
    },
  });
}

export function useDesligarCadencia(id: string, pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post(`/api/v1/ai/followup-flows/${id}/disable`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cadencia", id] });
      void qc.invalidateQueries({ queryKey: chaveDoFunil(pipelineId) });
    },
  });
}

export function useCotaDoNumero(channelSessionId: string | null) {
  return useQuery({
    queryKey: ["cadencia-cota", channelSessionId],
    enabled: channelSessionId !== null,
    // A cota anda enquanto a régua envia: 1 min é o passo do próprio worker.
    refetchInterval: 60_000,
    queryFn: async () =>
      (await apiClient.get<{ data: CotaDoNumero }>(`/api/v1/cadencias/cota?channel_session_id=${channelSessionId}`))
        .data,
  });
}

export function usePausaDasCadencias() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["cadencias-pausa"],
    queryFn: async () => (await apiClient.get<{ data: { pausadas: boolean } }>("/api/v1/cadencias/pausa")).data,
  });
  const alternar = useMutation({
    mutationFn: async (pausadas: boolean) =>
      (await apiClient.post<{ data: { pausadas: boolean } }>("/api/v1/cadencias/pausa", { pausadas })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cadencias-pausa"] }),
  });
  return { query, alternar };
}

export interface PreviewDeVariante {
  indice: number;
  ok: boolean;
  texto?: string;
  motivo?: string;
  faltando?: string[];
}

export function usePreviewDaCadencia(id: string) {
  return useMutation({
    mutationFn: async (input: { lead_id: string; variantes: string[] }) =>
      (await apiClient.post<{ data: { variantes: PreviewDeVariante[] } }>(`/api/v1/cadencias/${id}/preview`, input))
        .data.variantes,
  });
}

export interface PreviaDaInscricao {
  entram_hoje: number;
  recusados: Array<{ lead_id: string; motivo: string }>;
  cabem_hoje: number;
  total: number;
}

export function useInscreverNaCadencia(pipelineId: string) {
  const qc = useQueryClient();
  const previa = useMutation({
    mutationFn: async (input: { cadenciaId: string; leadIds: string[] }) =>
      (
        await apiClient.post<{ data: PreviaDaInscricao }>(`/api/v1/cadencias/${input.cadenciaId}/inscrever`, {
          lead_ids: input.leadIds,
          dry_run: true,
        })
      ).data,
  });
  const confirmar = useMutation({
    mutationFn: async (input: { cadenciaId: string; leadIds: string[]; confirmCount: number }) =>
      (
        await apiClient.post<{ data: { inscritos: number; recusados: Array<{ lead_id: string; motivo: string }> } }>(
          `/api/v1/cadencias/${input.cadenciaId}/inscrever`,
          { lead_ids: input.leadIds, confirm_count: input.confirmCount },
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: chaveDoFunil(pipelineId) }),
  });
  return { previa, confirmar };
}
