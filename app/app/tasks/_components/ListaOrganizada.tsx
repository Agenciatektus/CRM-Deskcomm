"use client";

import { useState } from "react";

import { CabecalhoDeGrupo } from "@/components/tarefas/CabecalhoDeGrupo";
import { LinhaDeTarefa, type PropsDaLinhaDeTarefa } from "@/components/tarefas/LinhaDeTarefa";
import { rotulosDaFaixa } from "@/components/tarefas/rotulos";
import { useT } from "@/hooks/i18n/useT";
import { agrupaPorResponsavel, comparadorDasTarefas, SEM_RESPONSAVEL, type Agrupamento, type OrdemDasTarefas } from "@/lib/tarefas/recorte";
import { agrupaPorPrazo, type FaixaDePrazo, type Tarefa } from "@/lib/tarefas/tipos";

/** As props de linha que valem para todas (a tarefa e o nome variam por linha). */
type PropsComuns = Omit<PropsDaLinhaDeTarefa, "tarefa" | "nomeDoResponsavel" | "selecionada">;

interface Props extends PropsComuns {
  tarefas: Tarefa[];
  ordem: OrdemDasTarefas;
  agrupar: Agrupamento;
  agora: Date;
  usuarioId: string;
  selecionadas: ReadonlySet<string>;
  /** Marca/desmarca todas as tarefas de um grupo. */
  aoSelecionarGrupo: (ids: string[], marcar: boolean) => void;
  nomeDoResponsavel: (tarefa: Tarefa) => string | null;
  /** O nome de um membro pelo id (o agrupamento por responsável). */
  nomeDe: (id: string) => string;
  /**
   * A organização não tem NENHUMA tarefa (não é o filtro que esvaziou): o
   * vazio fala do hábito, não dos filtros.
   */
  semNenhuma?: boolean;
}

/** "Encerradas" começa recolhido: é registro, não trabalho a fazer. */
const RECOLHIDOS_DE_PARTIDA: ReadonlySet<string> = new Set<FaixaDePrazo>(["encerrada"]);

/**
 * A LISTA da tela de Tarefas: grupos com contagem (por prazo — Atrasadas,
 * Hoje, Esta semana, Mais tarde, Sem prazo, Encerradas — ou por responsável),
 * cada um recolhível, com a ordem escolhida DENTRO do grupo. A caixa do
 * cabeçalho do grupo marca todas as dele para o lote.
 */
export function ListaOrganizada({
  tarefas,
  ordem,
  agrupar,
  agora,
  usuarioId,
  selecionadas,
  aoSelecionarGrupo,
  nomeDoResponsavel,
  nomeDe,
  semNenhuma = false,
  ...linha
}: Props) {
  const t = useT();
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(RECOLHIDOS_DE_PARTIDA);
  const faixas = rotulosDaFaixa(t);
  const comparar = comparadorDasTarefas(ordem);

  const grupos =
    agrupar === "responsavel"
      ? agrupaPorResponsavel(tarefas, usuarioId, nomeDe).map((g) => ({
          chave: `resp:${g.chave}`,
          titulo: g.chave === SEM_RESPONSAVEL ? t("Sem responsável") : g.chave === usuarioId ? t("Eu") : nomeDe(g.chave),
          alerta: false,
          tarefas: [...g.tarefas].sort(comparar),
        }))
      : agrupaPorPrazo(tarefas, agora).map((g) => ({
          chave: g.faixa,
          titulo: faixas[g.faixa],
          alerta: g.faixa === "atrasada",
          tarefas: [...g.tarefas].sort(comparar),
        }));

  if (grupos.length === 0 && semNenhuma) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">{t("Nenhuma tarefa por aqui")}</p>
        <p className="mt-1 text-xs text-text-muted">
          {t("Enquanto isto estiver vazio, o que foi combinado vive só na memória de alguém.")}
        </p>
      </div>
    );
  }

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">{t("Nenhuma tarefa neste recorte")}</p>
        <p className="mt-1 text-xs text-text-muted">
          {t("Mude os filtros, ou crie uma tarefa para o que ficou combinado.")}
        </p>
      </div>
    );
  }

  const alternar = (chave: string) =>
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => {
        const aberto = !recolhidos.has(g.chave);
        const idDaLista = `grupo-de-tarefas-${g.chave.replace(/[^a-z0-9-]/gi, "")}`;
        const ids = g.tarefas.map((x) => x.id);
        const todas = ids.length > 0 && ids.every((id) => selecionadas.has(id));
        return (
          <section key={g.chave} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {linha.aoSelecionar && linha.podeEditar && (
                <input
                  type="checkbox"
                  aria-label={`${t("Selecionar todas de")} ${g.titulo}`}
                  checked={todas}
                  onChange={() => aoSelecionarGrupo(ids, !todas)}
                  className="ml-3 size-4 shrink-0 accent-(--color-accent)"
                />
              )}
              <div className="min-w-0 flex-1">
                <CabecalhoDeGrupo
                  idDaLista={idDaLista}
                  titulo={g.titulo}
                  contagem={g.tarefas.length}
                  aberto={aberto}
                  alerta={g.alerta}
                  onAlternar={() => alternar(g.chave)}
                />
              </div>
            </div>
            {/* O contêiner existe recolhido também: é o alvo do `aria-controls`. */}
            <div id={idDaLista} hidden={!aberto} className="rounded-xl border border-border bg-surface py-1">
              {aberto &&
                g.tarefas.map((tarefa) => (
                  <LinhaDeTarefa
                    key={tarefa.id}
                    {...linha}
                    agora={agora}
                    usuarioId={usuarioId}
                    tarefa={tarefa}
                    selecionada={selecionadas.has(tarefa.id)}
                    nomeDoResponsavel={nomeDoResponsavel(tarefa)}
                  />
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
