"use client";
import { useState } from "react";

import { useUser } from "@/hooks/auth/AuthProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useTasks } from "@/hooks/tasks/useTasks";
import { secoesDaLista, type SecaoDaLista } from "@/lib/mobile/tarefas-do-celular";
import type { Tarefa } from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

import { AgendaDaSemana } from "./AgendaDaSemana";
import { CartaoDaTarefa } from "./CartaoDaTarefa";

/** O relógio fora da renderização (a regra de pureza do React): lido a cada render. */
function agora(): Date {
  return new Date();
}

const DE_QUEM = ["todas", "minhas"] as const;

const chip = (ligado: boolean) =>
  cn(
    "relative flex h-(--mb-chip-altura) shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1",
    ligado ? "pele-grad-contador bg-accent text-accent-foreground" : "bg-surface-elevated text-text-muted shadow-[inset_0_0_0_1px_var(--color-border)]",
  );

const aba = (ligada: boolean) =>
  cn(
    "pele-foco flex min-h-(--mb-alvo) flex-1 items-center justify-center rounded-[10px] text-[14.5px] font-semibold",
    ligada ? "bg-surface text-text shadow-sm" : "text-text-muted",
  );

/**
 * TAREFAS NO CELULAR (o item 07 do protótipo): abas Lista e Agenda. A Lista tem os
 * chips Todas e Minhas (com o número de abertas de cada um; "Minhas" é o filtro
 * `assigned_to=eu` da rota), as seções Atrasadas, Hoje e Próximas, e o check de 48px
 * que conclui com um toque e Desfazer. A Agenda é a semana de 7 dias, com ponto nos
 * dias que têm tarefa ou compromisso. O título, a lupa e o FAB "+" com a folha
 * Criar vêm da casca; abrir uma tarefa usa o formulário de sempre (`aoAbrirTarefa`).
 */
export function TarefasNoCelular({ podeEditar, aoAbrirTarefa }: { podeEditar: boolean; aoAbrirTarefa: (tarefa: Tarefa) => void }) {
  const t = useT();
  const tag = useTagDeIdioma();
  const eu = useUser().id;
  const [vista, setVista] = useState<"lista" | "agenda">("lista");
  const [quem, setQuem] = useState<"todas" | "minhas">("todas");
  // As concluídas nesta visita: somem da consulta de abertas, mas ficam na seção
  // "Concluídas" para quem quiser reabrir sem caçar a tarefa.
  const [concluidas, setConcluidas] = useState<Tarefa[]>([]);

  const todas = useTasks({ aberto: true });
  const minhas = useTasks({ aberto: true, responsavel: "eu" });
  const { data: membros } = useAssignableMembers(true);
  const nomes = new Map((membros ?? []).map((m) => [m.user_id, m.full_name]));

  const daVez = quem === "minhas" ? minhas : todas;
  const idsConcluidas = new Set(concluidas.map((c) => c.id));
  const abertas = (lista: Tarefa[]) => lista.filter((x) => !idsConcluidas.has(x.id));
  const relogio = agora();
  const secoes = secoesDaLista(abertas(daVez.tarefas), relogio);
  const concluidasDaVez = concluidas.filter((c) => quem === "todas" || c.assigned_to === eu);

  const rotulo: Record<SecaoDaLista, string> = { atrasadas: t("Atrasadas"), hoje: t("Hoje"), proximas: t("Próximas") };
  const quemFaz = (tarefa: Tarefa) =>
    tarefa.assigned_to && tarefa.assigned_to !== eu ? `${t("com")} ${nomes.get(tarefa.assigned_to) ?? t("alguém da equipe")}` : null;

  const cartao = (tarefa: Tarefa, concluida: boolean) => (
    <CartaoDaTarefa
      key={tarefa.id}
      tarefa={tarefa}
      concluida={concluida}
      apoio={quemFaz(tarefa)}
      agora={relogio}
      tag={tag}
      podeEditar={podeEditar}
      aoAbrir={() => aoAbrirTarefa(tarefa)}
      aoConcluir={() => setConcluidas((lista) => [tarefa, ...lista])}
      aoDesfazer={() => setConcluidas((lista) => lista.filter((c) => c.id !== tarefa.id))}
      gravar={(status) => daVez.editarTarefa(tarefa.id, { status })}
    />
  );

  return (
    <div className="flex flex-col pb-4" data-testid="tarefas-no-celular">
      <div role="tablist" aria-label={t("Modo de ver")} className="mx-4 flex gap-1 rounded-xl bg-tint p-1">
        <button type="button" role="tab" aria-selected={vista === "lista"} onClick={() => setVista("lista")} className={aba(vista === "lista")}>
          {t("Lista")}
        </button>
        <button type="button" role="tab" aria-selected={vista === "agenda"} onClick={() => setVista("agenda")} className={aba(vista === "agenda")}>
          {t("Agenda")}
        </button>
      </div>

      {vista === "agenda" ? (
        <AgendaDaSemana tarefas={abertas(todas.tarefas)} agora={relogio} tag={tag} aoAbrirTarefa={podeEditar ? aoAbrirTarefa : null} />
      ) : (
        <>
          <div role="group" aria-label={t("De quem")} className="flex gap-2 px-4 py-3">
            {DE_QUEM.map((valor) => (
              <button key={valor} type="button" aria-pressed={quem === valor} onClick={() => setQuem(valor)} className={chip(quem === valor)}>
                {valor === "minhas" ? t("Minhas") : t("Todas")}
                <span className="tabular-nums">{abertas((valor === "minhas" ? minhas : todas).tarefas).length}</span>
              </button>
            ))}
          </div>
          {daVez.carregando && <p className="px-4 py-8 text-center text-sm text-text-muted">{t("Carregando…")}</p>}
          {daVez.falhou && <p className="px-4 py-8 text-center text-sm text-text-muted">{t("Não foi possível carregar as tarefas.")}</p>}
          {secoes.map(({ secao, tarefas }) => (
            <section key={secao} aria-label={rotulo[secao]}>
              <h2
                className={cn(
                  "flex justify-between px-5 pt-4 pb-2 text-[12.5px] font-bold tracking-[0.06em] uppercase",
                  secao === "atrasadas" ? "text-error-fg" : "text-text-subtle",
                )}
              >
                <span>{rotulo[secao]}</span>
                <span>{tarefas.length}</span>
              </h2>
              {tarefas.map((tarefa) => cartao(tarefa, false))}
            </section>
          ))}
          {concluidasDaVez.length > 0 && (
            <section aria-label={t("Concluídas")}>
              <h2 className="flex justify-between px-5 pt-4 pb-2 text-[12.5px] font-bold tracking-[0.06em] text-text-subtle uppercase">
                <span>{t("Concluídas")}</span>
                <span>{concluidasDaVez.length}</span>
              </h2>
              {concluidasDaVez.map((tarefa) => cartao(tarefa, true))}
            </section>
          )}
          {!daVez.carregando && !daVez.falhou && secoes.length === 0 && concluidasDaVez.length === 0 && (
            <div className="px-8 py-10 text-center text-text-muted">
              <b className="mb-1.5 block text-[17px] text-text">{t("Tudo em dia")}</b>
              <p className="text-[14.5px]">{t("Nenhuma tarefa aberta para este filtro.")}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
