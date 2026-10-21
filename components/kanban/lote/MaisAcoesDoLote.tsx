"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { baixarCsv, montarCsv } from "@/lib/kanban/csv-da-lista";
import { linhasDoCsv } from "@/lib/kanban/linhas-do-csv";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";

import { GanhoEmLote } from "./GanhoEmLote";
import { LevarParaOutroFunilEmLote } from "./LevarParaOutroFunilEmLote";
import { TarefaEmLote } from "./TarefaEmLote";

/**
 * As ações em lote que não cabem como botão próprio na barra (celular incluso):
 * levar para outro funil, criar tarefa, reabrir, marcar como ganho e exportar.
 * "Adicionar à campanha" é fase 2.
 */
export function MaisAcoesDoLote({
  selectedIds,
  leads,
  stages,
  funis,
  pipelineId,
  ownerNames,
  usuarioId,
  ocupado,
  onReabrir,
  onClear,
  onRestaurar,
}: {
  selectedIds: string[];
  /** O recorte na tela, na ordem que a pessoa vê (status, dono, CSV). */
  leads: Lead[];
  stages: Stage[];
  funis: Array<{ id: string; name: string }>;
  pipelineId: string;
  ownerNames: Map<string, string | null>;
  usuarioId: string;
  ocupado: boolean;
  /** Reabrir = mover os encerrados para uma etapa aberta, como o individual. */
  onReabrir: (ids: string[], stageId: string) => void;
  onClear: () => void;
  /** Devolve a seleção (Desfazer de uma ação que a limpou ao agendar). */
  onRestaurar: (ids: string[]) => void;
}) {
  const t = useT();
  const [dialogo, setDialogo] = useState<"funil" | "tarefa" | "ganho" | null>(null);
  const porId = new Map(leads.map((l) => [l.id, l]));
  const encerrados = selectedIds.filter((id) => {
    const s = porId.get(id)?.status;
    return s === "won" || s === "lost";
  });
  // Ganho só nos ABERTOS; os encerrados são contados no aviso (use Reabrir).
  const abertos = selectedIds.filter((id) => porId.get(id)?.status === "open");
  const abertas = stages.filter((s) => !s.is_won && !s.is_lost);
  const temGanho = stages.some((s) => s.is_won);
  // A seleção DESTE render: quando a ação é agendada, a tela a limpa e esta
  // barra desmonta; o Desfazer devolve exatamente o que estava marcado.
  const selecaoNoAgendamento = [...selectedIds];
  const restaurar = () => onRestaurar(selecaoNoAgendamento);
  const fechar = (aberto: boolean) => {
    if (!aberto) setDialogo(null);
  };

  const exportar = () => {
    const csv = montarCsv(linhasDoCsv(leads, selectedIds, { stages, ownerNames, t }));
    baixarCsv(`negocios-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={ocupado}>
            {t("Mais ações…")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" folhaNoCelular>
          {funis.length > 1 && (
            <DropdownMenuItem onClick={() => setDialogo("funil")}>{t("Levar para outro funil…")}</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialogo("tarefa")}>{t("Definir próximo passo…")}</DropdownMenuItem>
          {encerrados.length > 0 && abertas.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{`${t("Reabrir")} (${encerrados.length})`}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent folhaNoCelular>
                {abertas.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onReabrir(encerrados, s.id)}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {temGanho && abertos.length > 0 && (
            <DropdownMenuItem onClick={() => setDialogo("ganho")}>{t("Marcar como ganho…")}</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={exportar}>{t("Exportar CSV")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Cada diálogo só monta aberto: os dados dele (destinos, equipe) não são
          lidos à toa, e a escolha nasce zerada a cada abertura. */}
      {dialogo === "funil" && (
        <LevarParaOutroFunilEmLote
          open
          onOpenChange={fechar}
          selectedIds={selectedIds}
          pipelineId={pipelineId}
          funis={funis}
          onConcluido={onClear}
          onDesfeito={restaurar}
        />
      )}
      {dialogo === "tarefa" && (
        <TarefaEmLote
          open
          onOpenChange={fechar}
          selectedIds={selectedIds}
          leads={leads}
          usuarioId={usuarioId}
          pipelineId={pipelineId}
          onConcluido={onClear}
          onDesfeito={restaurar}
        />
      )}
      {dialogo === "ganho" && (
        <GanhoEmLote
          open
          onOpenChange={fechar}
          ids={abertos}
          ignorados={selectedIds.length - abertos.length}
          pipelineId={pipelineId}
          onConcluido={onClear}
          onDesfeito={restaurar}
        />
      )}
    </>
  );
}
