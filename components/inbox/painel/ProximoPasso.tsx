"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { forwardRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { faixaDePrazo, type Tarefa } from "@/lib/tarefas/tipos";
import { CaretDown, Check, Clock, ListChecks, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CriarProximoPasso } from "./CriarProximoPasso";
import { QuandoFazer } from "./QuandoFazer";
import { useTarefasDoContato } from "./useTarefasDoContato";

interface Props {
  contactId: string | null;
  /** O negócio ABERTO em foco, para a tarefa nascer presa a ele. */
  leadId: string | null;
  conversationId: string;
  usuarioId: string;
  leitura: boolean;
}

/**
 * PRÓXIMO PASSO = TAREFA COM PRAZO (decisão do Peterson, fase 3.3).
 *
 * Mora em `crm_tasks`, pelas rotas `/api/v1/tasks`, e não num campo novo do
 * contato: a tarefa já tem prazo, responsável, lista própria e linha na
 * timeline do negócio. Um segundo lugar para "o que fazer a seguir" seria a
 * segunda verdade que a tela de Tarefas não veria.
 *
 * Papéis, lidos das rotas e da RLS (`crm_tasks_write`): ler é `viewer`+; criar,
 * concluir e reagendar é `agent`+. Em `leitura` a tarefa aparece sem botões e o
 * formulário não é oferecido, que é o estado honesto para quem só observa.
 *
 * Na hora do prazo o responsável é avisado no sino (Central de avisos) e por
 * push do navegador: o cron `task-due-reminder` lê `crm_tasks.due_date`
 * (`lib/tarefas/aviso-de-tarefa.ts`, migration 9043). É isso que a tela promete
 * no formulário — e só isso: nada vai ao cliente.
 */
export const ProximoPasso = forwardRef<HTMLElement, Props>(function ProximoPasso(
  { contactId, leadId, conversationId, usuarioId, leitura },
  ref,
) {
  const t = useT();
  const locale = useLocaleDeData();
  const { lista, editar } = useTarefasDoContato(contactId);
  const membrosQ = useAssignableMembers(!leitura && !!contactId);
  const membros = Array.isArray(membrosQ.data) ? membrosQ.data : [];
  const [reagendando, setReagendando] = useState(false);
  const [novoPrazo, setNovoPrazo] = useState<Date | null>(null);
  // Recolhível como o `.acc` do protótipo, mas NASCE aberto: é o bloco que o
  // atendente mais usa, e escondê-lo por padrão custaria um clique por conversa.
  const [aberto, setAberto] = useState(true);

  const tarefas = lista.data ?? [];
  const proxima: Tarefa | undefined = tarefas[0];
  const faixa = proxima ? faixaDePrazo(proxima) : null;
  // Só afirma "sem tarefa" quando a lista RESPONDEU vazia (mesma régua do atalho
  // do cabeçalho); carregando ou com erro, o subtítulo fica calado.
  const semTarefa = lista.isSuccess && !proxima;
  const subtitulo = proxima ? proxima.title : semTarefa ? t("Nenhuma tarefa marcada") : "";

  const quem = (id: string | null) =>
    !id ? t("Sem responsável")
      : id === usuarioId ? t("Você")
        : (membros.find((m) => m.user_id === id)?.full_name ?? t("Membro da equipe"));

  function concluir(tarefa: Tarefa) {
    editar.mutate(
      { id: tarefa.id, entrada: { status: "done" } },
      {
        // SEM "Desfazer", de propósito (revisão do @Cassio_SecRev, P3): concluir
        // grava `task_completed` na linha do tempo do negócio, e voltar a tarefa
        // a pendente deixaria essa linha contando uma conclusão que não valeu.
        // Quem concluiu por engano reabre na tela de Tarefas, que é onde o
        // histórico inteiro aparece.
        onSuccess: () => toast.success(t("Tarefa concluída.")),
      },
    );
  }

  function salvarNovoPrazo(tarefa: Tarefa) {
    if (!novoPrazo) return;
    editar.mutate(
      { id: tarefa.id, entrada: { due_date: novoPrazo.toISOString() } },
      {
        onSuccess: () => {
          toast.success(t("Prazo atualizado."));
          setReagendando(false);
          setNovoPrazo(null);
        },
      },
    );
  }

  return (
    <section
      ref={ref}
      data-testid="inbox-proximo-passo"
      tabIndex={-1}
      // O atalho "Próximo passo" do cabeçalho foca ESTA seção: se ela estiver
      // recolhida, abre, senão o atalho levaria a um título sem conteúdo.
      onFocus={(e) => { if (e.target === e.currentTarget) setAberto(true); }}
      className="scroll-mt-12 rounded-xl border border-border bg-surface focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3>
        <button
          type="button"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left hover:bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {/* O quadrado do ícone vira aviso quando não há tarefa: é o mesmo sinal
              do atalho do cabeçalho, no lugar onde se resolve. */}
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-md",
              semTarefa ? "bg-warning-bg text-warning-fg" : "bg-accent-soft text-accent",
            )}
            aria-hidden
          >
            <ListChecks size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold text-text">{t("Próximo passo")}</span>
            {subtitulo && (
              <span className="block truncate text-[12.5px] font-normal text-text-muted">{subtitulo}</span>
            )}
          </span>
          <CaretDown size={16} className={cn("shrink-0 text-text-subtle transition-transform duration-base", aberto && "rotate-180")} aria-hidden />
        </button>
      </h3>
      {aberto && (
        <div className="px-3.5 pb-3.5">
          {lista.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : lista.isError ? (
            <div className="space-y-1">
              <p className="text-xs text-error-fg">{t("Não consegui ler as tarefas.")}</p>
              <Button size="sm" variant="outline" onClick={() => void lista.refetch()}>{t("Tentar de novo")}</Button>
            </div>
          ) : proxima ? (
            <div
              data-testid="tarefa-do-proximo-passo"
              className={cn("flex gap-2.5 rounded-lg border p-2.5", faixa === "atrasada" ? "border-error bg-error-bg" : "border-border bg-surface")}
            >
              {!leitura && (
                <button
                  type="button"
                  aria-label={t("Concluir tarefa")}
                  title={t("Concluir")}
                  disabled={editar.isPending}
                  onClick={() => concluir(proxima)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-border-strong text-transparent hover:border-accent hover:text-accent"
                >
                  <Check size={12} weight="bold" aria-hidden />
                </button>
              )}
              <div className="min-w-0 flex-1 text-xs">
                <div className="text-sm font-semibold leading-snug wrap-anywhere">{proxima.title}</div>
                {proxima.due_date && (
                  <div className={cn("mt-1 inline-flex items-center gap-1 font-medium", faixa === "atrasada" ? "text-error-fg" : faixa === "hoje" ? "text-warning-fg" : "text-text-muted")}>
                    <Clock size={12} aria-hidden />
                    {faixa === "atrasada" ? `${t("Atrasada")}, ` : ""}
                    {formatDistanceToNowStrict(new Date(proxima.due_date), { addSuffix: true, locale })}
                  </div>
                )}
                <div className="mt-0.5 text-text-muted">{t("Responsável")}: {quem(proxima.assigned_to)}</div>
                {tarefas.length > 1 && (
                  <div className="mt-0.5 text-text-muted">{t("Outras tarefas abertas")}: {tarefas.length - 1}</div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!leitura && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-expanded={reagendando} onClick={() => { setReagendando((v) => !v); setNovoPrazo(null); }}>
                      {t("Reagendar")}
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <Link href="/app/tasks">{t("Abrir em Tarefas")}</Link>
                  </Button>
                </div>
                {reagendando && !leitura && (
                  <div className="mt-2" data-testid="reagendar-tarefa">
                    <span id={`reagendar-${proxima.id}`} className="sr-only">{t("Novo prazo")}</span>
                    <QuandoFazer rotulo={`reagendar-${proxima.id}`} onEscolher={setNovoPrazo} />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" className="h-7 text-xs" disabled={!novoPrazo || editar.isPending} onClick={() => salvarNovoPrazo(proxima)}>
                        {t("Salvar novo prazo")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* Aviso em destaque (o `.need` do protótipo): maior que o texto ao redor,
                  porque é a frase que decide se o lead some ou não do radar. */}
              <div data-testid="sem-proximo-passo" className="flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2.5 text-[13px] font-semibold text-warning-fg">
                <Warning size={16} className="mt-px shrink-0" aria-hidden />{" "}
                <span>{t("Sem próximo passo. Lead sem tarefa some do radar da equipe.")}</span>
              </div>
              {leitura ? (
                <p className="mt-2 text-xs text-text-muted">{t("Criar e concluir tarefas fica com quem atende.")}</p>
              ) : (
                <CriarProximoPasso contactId={contactId} leadId={leadId} usuarioId={usuarioId} />
              )}
            </div>
          )}
          {contactId && (
            <Link className="mt-2 inline-block text-xs underline" href={`/app/agenda?contato=${contactId}&conversa=${conversationId}`}>
              {t("Marcar compromisso")}
            </Link>
          )}
        </div>
      )}
    </section>
  );
});
