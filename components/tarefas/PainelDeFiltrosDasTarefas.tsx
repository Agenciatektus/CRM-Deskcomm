"use client";

import { Grupo } from "@/components/kanban/barra/Grupo";
import { Chip } from "@/components/ui/chip";
import { useT } from "@/hooks/i18n/useT";
import {
  PERIODOS_DO_PRAZO,
  SITUACOES_DO_FILTRO,
  VINCULOS,
  type FiltrosDeTarefas,
} from "@/lib/tarefas/recorte";
import { PRIORIDADES_DA_TAREFA, type PrioridadeDaTarefa } from "@/lib/tarefas/tipos";

import type { MembroDaEquipe } from "./MenusDaTarefa";
import { rotulosDaPrioridade, rotulosDaSituacao, rotulosDoPeriodo, rotulosDoVinculo } from "./rotulos";

export interface FunilDoPainel {
  id: string;
  name: string;
  etapas: Array<{ id: string; name: string }>;
}

/**
 * O painel "Filtros" da tela de Tarefas — o MESMO desenho do painel do Funil
 * (`PainelDeFiltros`: grupos de chips, cada toque aplica na hora), no popover
 * do desktop e na folha do celular.
 *
 * A "Situação" mora aqui e substitui o seletor solto que a tela tinha: padrão
 * "Em aberto" (o que pede ação, mais as encerradas dos últimos 7 dias,
 * recolhidas). Funil e etapa só oferecem os que aparecem nas tarefas.
 */
export function PainelDeFiltrosDasTarefas({
  filtros,
  onChange,
  membros,
  usuarioId,
  funis,
}: {
  filtros: FiltrosDeTarefas;
  onChange: (f: FiltrosDeTarefas) => void;
  membros: MembroDaEquipe[];
  usuarioId: string;
  funis: FunilDoPainel[];
}) {
  const t = useT();
  const set = (parcial: Partial<FiltrosDeTarefas>) => onChange({ ...filtros, ...parcial });
  const resp = filtros.responsavel;
  const ehResp = (id: string) => () => set({ responsavel: resp === id ? undefined : id });
  const prioridades = rotulosDaPrioridade(t);
  const periodos = rotulosDoPeriodo(t);
  const vinculos = rotulosDoVinculo(t);
  const situacoes = rotulosDaSituacao(t);
  const situacao = filtros.situacao ?? "aberto";
  const alternaPrioridade = (p: PrioridadeDaTarefa) => {
    const atual = filtros.prioridades ?? [];
    const proxima = atual.includes(p) ? atual.filter((x) => x !== p) : [...atual, p];
    set({ prioridades: proxima.length ? proxima : undefined });
  };
  const funil = funis.find((f) => f.id === filtros.funil) ?? null;

  return (
    <div className="grid gap-5 p-4 largo:grid-cols-2">
      <Grupo titulo={t("Responsável")}>
        <Chip ligado={resp === "eu"} onClick={ehResp("eu")}>{t("Eu")}</Chip>
        {membros
          .filter((m) => m.user_id !== usuarioId)
          .map((m) => (
            <Chip key={m.user_id} ligado={resp === m.user_id} onClick={ehResp(m.user_id)}>
              {m.full_name ?? t("Sem nome")}
            </Chip>
          ))}
        <Chip ligado={resp === "sem"} onClick={ehResp("sem")}>{t("Sem responsável")}</Chip>
      </Grupo>

      <Grupo titulo={t("Situação")} apoio={t("Padrão: Em aberto")}>
        {SITUACOES_DO_FILTRO.map((s) => (
          <Chip key={s} ligado={situacao === s} onClick={() => set({ situacao: s === "aberto" ? undefined : s })}>
            {situacoes[s]}
          </Chip>
        ))}
      </Grupo>

      <Grupo titulo={t("Prioridade")}>
        {[...PRIORIDADES_DA_TAREFA].reverse().map((p) => (
          <Chip key={p} ligado={!!filtros.prioridades?.includes(p)} onClick={() => alternaPrioridade(p)}>
            {prioridades[p]}
          </Chip>
        ))}
      </Grupo>

      <Grupo titulo={t("Prazo")}>
        {PERIODOS_DO_PRAZO.map((p) => (
          <Chip key={p} ligado={filtros.periodo === p} onClick={() => set({ periodo: filtros.periodo === p ? undefined : p })}>
            {periodos[p]}
          </Chip>
        ))}
      </Grupo>

      <Grupo titulo={t("Vínculo")}>
        {VINCULOS.map((v) => (
          <Chip key={v} ligado={filtros.vinculo === v} onClick={() => set({ vinculo: filtros.vinculo === v ? undefined : v })}>
            {vinculos[v]}
          </Chip>
        ))}
      </Grupo>

      {funis.length > 0 && (
        <Grupo titulo={t("Funil")}>
          {funis.map((f) => (
            <Chip
              key={f.id}
              ligado={filtros.funil === f.id}
              onClick={() => set({ funil: filtros.funil === f.id ? undefined : f.id, etapa: undefined })}
            >
              {f.name}
            </Chip>
          ))}
        </Grupo>
      )}

      {funil && funil.etapas.length > 0 && (
        <Grupo titulo={t("Etapa")}>
          {funil.etapas.map((e) => (
            <Chip key={e.id} ligado={filtros.etapa === e.id} onClick={() => set({ etapa: filtros.etapa === e.id ? undefined : e.id })}>
              {e.name}
            </Chip>
          ))}
        </Grupo>
      )}
    </div>
  );
}
