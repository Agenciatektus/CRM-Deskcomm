"use client";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useCadencias, useCriarCadencia, usePausaDasCadencias, type Cadencia } from "@/hooks/cadencia/useCadencias";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FlowArrow, Plus } from "@/lib/ui/icons";
import { EditorDeCadencia } from "./EditorDeCadencia";

interface Etapa {
  id: string;
  name: string;
  is_lost?: boolean;
}

const STATUS: Record<string, { rotulo: string; variante: "default" | "secondary" | "outline" }> = {
  active: { rotulo: "No ar", variante: "default" },
  draft: { rotulo: "Rascunho", variante: "secondary" },
  disabled: { rotulo: "Desligada", variante: "outline" },
};

/**
 * AS CADÊNCIAS DE PROSPECÇÃO DESTE FUNIL — a segunda vista do pipeline.
 *
 * Lista, cria e abre o editor. O interruptor "Pausar todas" é o kill switch da
 * ORGANIZAÇÃO (não do funil): é o botão de "parem tudo agora", e pausar não
 * cancela ninguém — o worker só adia os próximos envios até retomar.
 */
export function CadenciasDoPipeline({
  pipelineId,
  etapas,
  leads,
}: {
  pipelineId: string;
  etapas: Etapa[];
  leads: Array<{ id: string; title: string }>;
}) {
  const t = useT();
  const podeEditar = usePermission("pipeline.create"); // manager+, o mesmo piso da API
  const { data: cadencias, isLoading, isError } = useCadencias(pipelineId);
  const criar = useCriarCadencia(pipelineId);
  const { query: pausa, alternar } = usePausaDasCadencias();
  const [aberta, setAberta] = useState<string | null>(null);
  const [nomeNova, setNomeNova] = useState("");

  if (aberta) {
    return (
      <EditorDeCadencia
        cadenciaId={aberta}
        pipelineId={pipelineId}
        etapas={etapas}
        leads={leads}
        onFechar={() => setAberta(null)}
      />
    );
  }

  const pausadas = pausa.data?.pausadas === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("Pausar todas as cadências")}</p>
          <p className="text-xs text-text-muted">
            {pausadas
              ? t("Pausadas: nenhuma mensagem de cadência sai até retomar. Ninguém perde o lugar na régua.")
              : t("Use se o número estiver em risco ou se uma mensagem errada estiver no ar.")}
          </p>
        </div>
        <Switch
          checked={pausadas}
          disabled={!podeEditar || alternar.isPending || pausa.isLoading}
          onCheckedChange={(v) => alternar.mutate(v)}
          aria-label={t("Pausar todas as cadências")}
        />
      </div>
      {alternar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {alternar.error instanceof Error ? alternar.error.message : t("Não foi possível mudar a pausa.")}
        </p>
      )}

      {podeEditar && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const nome = nomeNova.trim();
            if (!nome) return;
            criar.mutate(
              { name: nome },
              {
                onSuccess: (c) => {
                  setNomeNova("");
                  setAberta(c.id);
                },
              },
            );
          }}
        >
          <Input
            aria-label={t("Nome da nova cadência")}
            placeholder={t("Nome da nova cadência, ex.: Lojistas lista fria")}
            maxLength={80}
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
          />
          <Button type="submit" disabled={!nomeNova.trim() || criar.isPending}>
            <Plus size={16} className="mr-1" aria-hidden /> {t("Criar")}
          </Button>
        </form>
      )}
      {criar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {criar.error instanceof Error ? criar.error.message : t("Não foi possível criar a cadência.")}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-text-muted">{t("Carregando cadências…")}</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{t("Não foi possível carregar as cadências.")}</p>
      ) : (cadencias ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
          <FlowArrow size={32} weight="thin" className="text-text-subtle" aria-hidden />
          <p className="text-sm font-medium">{t("Nenhuma cadência neste funil")}</p>
          <p className="max-w-md text-xs text-text-muted">
            {t("Uma cadência manda uma sequência de mensagens pelo WhatsApp e para sozinha quando o lead responde.")}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(cadencias ?? []).map((c) => (
            <CartaoDaCadencia key={c.id} cadencia={c} etapas={etapas} onAbrir={() => setAberta(c.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoDaCadencia({ cadencia, etapas, onAbrir }: { cadencia: Cadencia; etapas: Etapa[]; onAbrir: () => void }) {
  const t = useT();
  const status = STATUS[cadencia.status] ?? STATUS.draft!;
  const gatilho = cadencia.trigger_config;
  const etapa = gatilho?.kind === "stage_change" ? etapas.find((e) => e.id === gatilho.params.stage_id) : undefined;
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{cadencia.name}</span>
          <Badge variant={status.variante}>{t(status.rotulo)}</Badge>
        </div>
        <span className="text-xs text-text-muted">
          {etapa ? `${t("Entra quem chega em")} ${etapa.name}` : t("Inscrição manual pelo Kanban")}
        </span>
        <span className="text-xs tabular-nums text-text-muted">
          {cadencia.na_regua ?? 0} {t("na régua agora")}
        </span>
      </button>
    </li>
  );
}
