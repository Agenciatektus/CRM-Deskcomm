"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { ModoDeAdiar } from "@/lib/tarefas/adiar";
import { atrasoRelativo } from "@/lib/tarefas/atraso";
import { estaEncerrada, type PrioridadeDaTarefa, type Tarefa } from "@/lib/tarefas/tipos";
import { Check, IdentificationCard, Kanban, PencilSimple, Trash, UserCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { AdiarRapido } from "./AdiarRapido";
import { MenuDePrioridade, MenuDeResponsavel, PilulaDePrioridade, type MembroDaEquipe } from "./MenusDaTarefa";

export interface PropsDaLinhaDeTarefa {
  tarefa: Tarefa;
  podeEditar: boolean;
  /** Já resolvido por quem monta a lista; `null` = sem responsável conhecido. */
  nomeDoResponsavel: string | null;
  aoAlternarConcluida: (t: Tarefa) => Promise<unknown>;
  aoEditar: (t: Tarefa) => void;
  aoApagar: (t: Tarefa) => Promise<unknown>;
  /** Mostrar de quem é a tarefa ("Lead: Nome · Funil", "Contato: Nome"). */
  mostrarVinculo?: boolean;
  /** Clique no título (a tela de Tarefas abre o dossiê do negócio). Sem ele, o título é só texto. */
  aoAbrir?: (t: Tarefa) => void;
  // ── Ações rápidas da tela de Tarefas (sem elas, a linha é a do dossiê) ──
  /** Liga a caixa de seleção do lote. */
  selecionada?: boolean;
  aoSelecionar?: (t: Tarefa) => void;
  aoAdiar?: (t: Tarefa, modo: ModoDeAdiar) => Promise<unknown>;
  aoReatribuir?: (t: Tarefa, userId: string | null) => Promise<unknown>;
  aoMudarPrioridade?: (t: Tarefa, p: PrioridadeDaTarefa) => Promise<unknown>;
  membros?: MembroDaEquipe[];
  usuarioId?: string;
  /** Fixa o relógio (vitrine, teste). */
  agora?: Date;
}

/**
 * LINHA DE TAREFA COM AÇÕES — a peça do design system que a tela de Tarefas,
 * o dossiê do negócio e as tarefas da demanda mostram.
 *
 * Sem as props de ação rápida, é a linha de sempre (concluir, editar, apagar).
 * Com elas, a tela de Tarefas ganha, NA PRÓPRIA LINHA: caixa de seleção do
 * lote, adiar com um clique, trocar o responsável e a prioridade — cada troca
 * pela mesma rota de edição (`PATCH /api/v1/tasks/[id]`).
 *
 * Tarefa atrasada diz HÁ QUANTO TEMPO ("Atrasada há 16 dias"), não só a data:
 * a data sozinha obriga quem lê a fazer a conta.
 */
export function LinhaDeTarefa({
  tarefa,
  podeEditar,
  nomeDoResponsavel,
  aoAlternarConcluida,
  aoEditar,
  aoApagar,
  mostrarVinculo = false,
  aoAbrir,
  selecionada,
  aoSelecionar,
  aoAdiar,
  aoReatribuir,
  aoMudarPrioridade,
  membros = [],
  usuarioId,
  agora,
}: PropsDaLinhaDeTarefa) {
  const t = useT();
  const tag = useTagDeIdioma();
  const [ocupada, setOcupada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const relogio = agora ?? new Date();
  const encerrada = estaEncerrada(tarefa);
  const atraso = atrasoRelativo(tarefa, relogio);

  async function comBloqueio(acao: () => Promise<unknown>) {
    if (ocupada) return;
    setOcupada(true);
    try {
      await acao();
    } finally {
      setOcupada(false);
    }
  }

  const negocio = tarefa.lead ?? null;
  const contato = tarefa.contato ?? null;
  const abrirNegocio = (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/⌘/meio abrem a ficha numa aba nova, como no Funil.
    if (!aoAbrir || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    aoAbrir(tarefa);
  };

  const prazo = tarefa.due_date
    ? new Date(tarefa.due_date).toLocaleString(tag, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : t("Sem prazo");

  const podeTrocar = podeEditar && !ocupada;

  return (
    <div
      data-tarefa={tarefa.id}
      className={cn(
        "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-ui ease-emphasized hover:bg-hover",
        encerrada && "opacity-60",
        selecionada && "bg-accent/5",
      )}
    >
      {aoSelecionar && (
        <input
          type="checkbox"
          aria-label={`${t("Selecionar")} ${tarefa.title}`}
          checked={!!selecionada}
          onChange={() => aoSelecionar(tarefa)}
          className="mt-0.5 shrink-0"
        />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={encerrada}
        aria-label={encerrada ? t("Reabrir a tarefa") : t("Marcar como concluída")}
        disabled={ocupada || !podeEditar}
        onClick={() => comBloqueio(() => aoAlternarConcluida(tarefa))}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
          encerrada ? "border-accent bg-accent text-accent-foreground" : "border-border-strong hover:border-accent",
        )}
      >
        {encerrada ? <Check size={12} weight="bold" aria-hidden /> : null}
      </button>

      <div className="min-w-0 flex-1">
        {aoAbrir ? (
          <button
            type="button"
            onClick={() => aoAbrir(tarefa)}
            className={cn(
              "block max-w-full truncate text-left text-sm font-medium text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent",
              encerrada && "text-text-muted line-through",
            )}
          >
            {tarefa.title}
          </button>
        ) : (
          <p className={cn("text-sm font-medium", encerrada && "text-muted-foreground line-through")}>{tarefa.title}</p>
        )}
        {tarefa.description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{tarefa.description}</p> : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta">
          {aoMudarPrioridade && podeEditar ? (
            <MenuDePrioridade
              atual={tarefa.priority}
              onEscolher={(p) => p !== tarefa.priority && comBloqueio(() => aoMudarPrioridade(tarefa, p))}
              gatilho={
                <button type="button" disabled={!podeTrocar} aria-label={t("Mudar a prioridade")} className="rounded-pill focus-visible:outline-2 focus-visible:outline-accent">
                  <PilulaDePrioridade prioridade={tarefa.priority} menu />
                </button>
              }
            />
          ) : (
            <PilulaDePrioridade prioridade={tarefa.priority} />
          )}

          <span className={cn("text-muted-foreground", atraso && "font-semibold text-error-fg")}>
            {prazo}
            {atraso ? (
              <>
                {" · "}
                {t("Atrasada")} {new Intl.RelativeTimeFormat(tag, { numeric: "always" }).format(-atraso.valor, atraso.unidade)}
              </>
            ) : null}
          </span>

          {aoReatribuir && podeEditar && usuarioId ? (
            <MenuDeResponsavel
              membros={membros}
              usuarioId={usuarioId}
              atual={tarefa.assigned_to}
              onEscolher={(id) => id !== tarefa.assigned_to && comBloqueio(() => aoReatribuir(tarefa, id))}
              gatilho={
                <button
                  type="button"
                  disabled={!podeTrocar}
                  aria-label={t("Trocar o responsável")}
                  className="flex items-center gap-1 rounded-md px-1 text-muted-foreground hover:bg-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <UserCircle size={12} aria-hidden />
                  {nomeDoResponsavel ?? t("Sem responsável")}
                </button>
              }
            />
          ) : nomeDoResponsavel ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <UserCircle size={12} aria-hidden />
              {nomeDoResponsavel}
            </span>
          ) : null}

          {mostrarVinculo && negocio ? (
            <Link
              href={`/app/leads/${negocio.id}`}
              onClick={abrirNegocio}
              className="flex min-w-0 max-w-[22rem] items-center gap-1 text-muted-foreground hover:text-text hover:underline"
              title={negocio.funil ? `${negocio.title} · ${negocio.funil.name}` : negocio.title}
            >
              <Kanban size={12} aria-hidden className="shrink-0" />
              <span className="truncate">
                {t("Lead")}: {negocio.title}
                {negocio.funil ? ` · ${negocio.funil.name}` : ""}
              </span>
            </Link>
          ) : mostrarVinculo && contato ? (
            <span className="flex min-w-0 max-w-[22rem] items-center gap-1 text-muted-foreground" title={rotuloDoContato(contato, t)}>
              <IdentificationCard size={12} aria-hidden className="shrink-0" />
              <span className="truncate">
                {t("Contato")}: {rotuloDoContato(contato, t)}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {podeEditar ? (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 mb:opacity-100">
          {aoAdiar && !encerrada && (
            <AdiarRapido
              compacto
              prazoAtual={tarefa.due_date}
              agora={agora}
              disabled={ocupada}
              onEscolher={(modo) => comBloqueio(() => aoAdiar(tarefa, modo))}
            />
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("Editar a tarefa")} onClick={() => aoEditar(tarefa)}>
            <PencilSimple size={14} aria-hidden />
          </Button>
          {/*
            Confirmação em DOIS TOQUES no lugar de `confirm()`: `window.confirm`
            é bloqueado em iframe, ignora o tema e não passa por `t()`.
          */}
          {confirmando ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-meta"
              disabled={ocupada}
              onClick={() => comBloqueio(() => aoApagar(tarefa))}
            >
              {t("Confirmar")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={t("Apagar a tarefa")}
              onClick={() => setConfirmando(true)}
              onBlur={() => setConfirmando(false)}
            >
              <Trash size={14} aria-hidden />
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
