"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { usePipelines, usePipelineStages } from "@/hooks/webhooks/useWebhookSources";

export interface CreateLeadInPipelineConfig {
  pipeline_id: string;
  stage_id: string;
  copiar_valor?: boolean;
  copiar_dono?: boolean;
}

/**
 * "Criar card em outro funil" — funil, etapa e as duas cópias opcionais.
 *
 * Só etapas ABERTAS aparecem: um card que nascesse em "Pago" ou "Cancelado"
 * fecharia no mesmo instante, e o servidor recusa essa escolha
 * (`etapa_de_destino_de_fechamento`). Escondê-la aqui evita a regra que a tela
 * aceita e a execução reprova.
 */
export function CreateLeadInPipelineForm({
  config,
  onChange,
}: {
  config: CreateLeadInPipelineConfig;
  onChange: (config: CreateLeadInPipelineConfig) => void;
}) {
  const t = useT();
  const idValor = React.useId();
  const idDono = React.useId();
  const { data: pipelinesRes, isLoading: pipelinesLoading } = usePipelines();
  const { data: boardRes, isLoading: stagesLoading } = usePipelineStages(config.pipeline_id || null);
  const pipelines = pipelinesRes?.data ?? [];
  const etapasAbertas = (boardRes?.data?.stages ?? []).filter((s) => !s.is_won && !s.is_lost);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("Funil de destino")}</Label>
          <Select
            value={config.pipeline_id}
            onValueChange={(v) => onChange({ ...config, pipeline_id: v, stage_id: "" })}
            disabled={pipelinesLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("Escolha o funil")} />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t("Etapa onde o card nasce")}</Label>
          <Select
            value={config.stage_id}
            onValueChange={(v) => onChange({ ...config, stage_id: v })}
            disabled={!config.pipeline_id || stagesLoading}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={config.pipeline_id ? t("Escolha a etapa") : t("Escolha o funil primeiro")}
              />
            </SelectTrigger>
            <SelectContent>
              {etapasAbertas.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id={idValor}
          checked={config.copiar_valor === true}
          onCheckedChange={(v) => onChange({ ...config, copiar_valor: v })}
        />
        <Label htmlFor={idValor}>{t("Copiar o valor do card de origem")}</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={idDono}
          checked={config.copiar_dono === true}
          onCheckedChange={(v) => onChange({ ...config, copiar_dono: v })}
        />
        <Label htmlFor={idDono}>{t("Manter o mesmo responsável")}</Label>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          "O card que disparou a regra continua onde está. Se o contato já tem um card aberto nesse funil, nenhum outro é criado.",
        )}
      </p>
    </div>
  );
}
