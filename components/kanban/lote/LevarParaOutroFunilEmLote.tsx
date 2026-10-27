"use client";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Escolha } from "@/components/ui/escolha";
import { useT } from "@/hooks/i18n/useT";
import { AVISO_DE_LOTE_EM_CURSO, agendarNoLote, useAcaoPorNegocio } from "@/hooks/kanban/useAcaoPorNegocio";
import { apiClient } from "@/lib/api/client";
import type { Stage } from "@/lib/kanban/types";

/**
 * "Levar para outro funil" em LOTE. Cada negócio vai pela MESMA rota da ação
 * individual (`POST /leads/[id]/clone` → `moverNegocioDeFunil` →
 * `fn_mover_lead_de_funil`): move o MESMO card, nunca clona; grava a passagem e
 * respeita as guardas do banco e os campos exigidos da etapa de destino. Quem
 * falha é contado no fim; quem deu certo fica.
 *
 * "Rodar as automações de entrada da etapa" nasce DESLIGADO, como no individual
 * (só ligado sai o `lead.stage_changed` marcado da #207).
 */
export function LevarParaOutroFunilEmLote({
  open,
  onOpenChange,
  selectedIds,
  pipelineId,
  funis,
  onConcluido,
  onDesfeito,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  pipelineId: string;
  funis: Array<{ id: string; name: string }>;
  onConcluido: () => void;
  /** Desfazer nos 5 s: a tela devolve a seleção que limpou ao agendar. */
  onDesfeito: () => void;
}) {
  const t = useT();
  const id = useId();
  const [destino, setDestino] = useState("");
  const [etapa, setEtapa] = useState("");
  const [rodar, setRodar] = useState(false);
  const porNegocio = useAcaoPorNegocio(pipelineId);
  const destinos = funis.filter((f) => f.id !== pipelineId);
  // As etapas do funil de destino: o quadro dele já é lido por quem pode mover
  // card (agent+); `/pipelines/[id]/stages` é manager+.
  const etapas = useQuery({
    queryKey: ["lote-etapas-do-destino", destino],
    queryFn: () => apiClient.get<{ data: { stages: Stage[] } }>(`/api/v1/pipelines/${destino}/board`),
    enabled: open && !!destino,
    staleTime: 30_000,
    select: (r) => r.data.stages.filter((s) => !s.is_won && !s.is_lost),
  });

  const confirmar = () => {
    if (!destino) return;
    const ids = [...selectedIds];
    const corpo = {
      pipeline_id: destino,
      ...(etapa ? { stage_id: etapa } : {}),
      rodar_automacoes_de_entrada: rodar,
    };
    onOpenChange(false);
    const agendado = agendarNoLote(
      pipelineId,
      (s) => `${t("Levando os selecionados para outro funil")} (${s} s)`,
      t("Desfazer"),
      async () => {
        await porNegocio(
          ids,
          (leadId) => apiClient.post(`/api/v1/leads/${leadId}/clone`, corpo),
          (n) => `${n} ${t(n === 1 ? "levado para o outro funil." : "levados para o outro funil.")}`,
        );
      },
      onDesfeito,
    );
    if (agendado) onConcluido();
    else toast.warning(t(AVISO_DE_LOTE_EM_CURSO));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Levar para outro funil")}</DialogTitle>
          <DialogDescription>
            {t(
              "Os mesmos negócios vão para o funil escolhido, com conversa, histórico, etiquetas e campos. Este funil continua contando o resultado que eles tiveram aqui.",
            )}
          </DialogDescription>
        </DialogHeader>
        {destinos.length === 0 ? (
          <p className="text-sm text-text-muted">
            {t("Este é o único funil. Crie outro funil para poder levar o negócio até ele.")}
          </p>
        ) : (
          <div className="space-y-3">
            <label htmlFor={`${id}-funil`} className="block text-xs font-semibold text-text-muted">
              {t("Funil de destino")}
            </label>
            <Escolha
              id={`${id}-funil`}
              value={destino}
              onValueChange={(v) => {
                setDestino(v);
                setEtapa("");
              }}
              opcoes={[
                { value: "", label: t("Escolha o funil de destino") },
                ...destinos.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
            <label htmlFor={`${id}-etapa`} className="block text-xs font-semibold text-text-muted">
              {t("Etapa de destino")}
            </label>
            <Escolha
              id={`${id}-etapa`}
              value={etapa}
              onValueChange={setEtapa}
              disabled={!destino}
              opcoes={[
                { value: "", label: t("Primeira etapa aberta") },
                ...(etapas.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <label htmlFor={`${id}-rodar`} className="flex items-start gap-2 text-sm">
              <input
                id={`${id}-rodar`}
                type="checkbox"
                checked={rodar}
                onChange={(e) => setRodar(e.target.checked)}
                className="mt-1"
              />
              <span>
                {t("Rodar as automações de entrada da etapa")}
                <span className="block text-xs text-text-muted">
                  {t("As automações da etapa de destino rodam como se o card tivesse acabado de entrar. Conversões de anúncio não são enviadas.")}
                </span>
              </span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button onClick={confirmar} disabled={!destino}>
            {t("Confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
