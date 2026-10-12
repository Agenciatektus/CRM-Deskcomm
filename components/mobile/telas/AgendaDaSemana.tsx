"use client";
import Link from "next/link";
import { useState } from "react";

import { useAgendamentos } from "@/hooks/agenda/useAgendamentos";
import { useT } from "@/hooks/i18n/useT";
import { diaLocal, itensDoDia, seteDias, type ItemDaAgenda } from "@/lib/mobile/tarefas-do-celular";
import { useTelasVisiveis } from "@/lib/mobile/useOpcoesDeCriar";
import type { Tarefa } from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

/**
 * A AGENDA da aba Tarefas no celular: os 7 dias a partir de hoje, com ponto nos dias
 * que têm tarefa ou compromisso, e o dia escolhido em ordem de horário. Junta as
 * tarefas abertas com prazo e os agendamentos (`/api/v1/agenda/agendamentos`, pelo
 * recorte da semana em instantes); os agendamentos só são pedidos a quem vê a Agenda
 * no menu, e os cancelados ficam de fora.
 */
export function AgendaDaSemana({
  tarefas,
  agora,
  tag,
  aoAbrirTarefa,
}: {
  tarefas: Tarefa[];
  agora: Date;
  tag: string;
  aoAbrirTarefa: ((tarefa: Tarefa) => void) | null;
}) {
  const t = useT();
  const veAgenda = useTelasVisiveis().has("/app/agenda");
  const dias = seteDias(agora);
  const [escolhido, setEscolhido] = useState(0);

  // Meia-noite de hoje até a de daqui a 7 dias: estável no dia inteiro (a chave da
  // consulta é comparada por valor, então o objeto novo a cada render não repete o pedido).
  const de = dias[0]!.toISOString();
  const ate = new Date(dias[6]!.getFullYear(), dias[6]!.getMonth(), dias[6]!.getDate() + 1).toISOString();
  const recorte = veAgenda ? { de, ate } : null;
  const { data: agendamentos } = useAgendamentos(recorte);

  const porId = new Map(tarefas.map((x) => [x.id, x]));
  const itens: ItemDaAgenda[] = [
    ...tarefas.flatMap((x) => (x.due_date ? [{ id: x.id, tipo: "tarefa" as const, inicio: x.due_date, titulo: x.title, apoio: null }] : [])),
    ...(agendamentos ?? [])
      .filter((a) => a.situacao !== "cancelled")
      .map((a) => ({ id: a.id, tipo: "compromisso" as const, inicio: a.comeca, titulo: a.titulo, apoio: a.quemSeraAtendido ?? null })),
  ];

  const longa = (d: Date) => d.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" });
  const doDia = itensDoDia(itens, diaLocal(dias[escolhido]!));
  const titulo = `${escolhido === 0 ? `${t("Hoje")}, ` : escolhido === 1 ? `${t("Amanhã")}, ` : ""}${longa(dias[escolhido]!)}`;

  return (
    <div data-testid="agenda-da-semana">
      <div role="group" aria-label={t("Dias da semana")} className="grid grid-cols-7 gap-1 px-3 pt-3 pb-2">
        {dias.map((d, i) => {
          const tem = itensDoDia(itens, diaLocal(d)).length > 0;
          const ligado = i === escolhido;
          return (
            <button
              key={d.toISOString()}
              type="button"
              aria-pressed={ligado}
              aria-label={`${longa(d)}${tem ? `, ${t("com compromissos")}` : ""}`}
              onClick={() => setEscolhido(i)}
              className={cn(
                "pele-foco flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-[14px] text-xs",
                ligado ? "pele-grad-contador bg-accent text-accent-foreground" : "text-text-muted",
              )}
            >
              <span>{i === 0 ? t("Hoje") : d.toLocaleDateString(tag, { weekday: "short" }).replace(".", "")}</span>
              <b className={cn("text-lg", !ligado && "text-text")}>{d.getDate()}</b>
              <i
                data-testid={tem ? "ponto-do-dia" : undefined}
                aria-hidden
                className={cn("size-[5px] rounded-full", tem ? (ligado ? "bg-accent-foreground" : "bg-accent-text") : "bg-transparent")}
              />
            </button>
          );
        })}
      </div>
      <h2 className="px-5 pt-2 pb-2.5 text-[15px] font-bold text-text first-letter:uppercase">{titulo}</h2>
      {doDia.map((item) => {
        const tarefa = item.tipo === "tarefa" ? porId.get(item.id) : undefined;
        const corpo = (
          <>
            <b className="block text-[15px] text-text">{item.titulo}</b>
            {item.apoio && <small className="mt-0.5 block text-[13px] text-text-muted">{item.apoio}</small>}
            <span
              className={cn(
                "mt-1.5 inline-flex h-[22px] items-center rounded-md px-2 text-xs font-bold",
                item.tipo === "compromisso" ? "bg-info-bg text-info-fg" : "bg-accent/15 text-accent-text",
              )}
            >
              {item.tipo === "compromisso" ? t("Compromisso") : t("Tarefa")}
            </span>
          </>
        );
        const caixa = "pele-foco block w-full rounded-[14px] bg-surface px-3.5 py-3 text-left shadow-[0_0_0_1px_var(--color-border)]";
        return (
          <div key={`${item.tipo}-${item.id}`} className="mx-4 mb-2 grid grid-cols-[52px_minmax(0,1fr)] gap-2">
            <span className="pt-3.5 font-mono text-sm text-text-muted">
              {new Date(item.inicio).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" })}
            </span>
            {item.tipo === "compromisso" ? (
              <Link href="/app/agenda" className={caixa}>
                {corpo}
              </Link>
            ) : tarefa && aoAbrirTarefa ? (
              <button type="button" onClick={() => aoAbrirTarefa(tarefa)} className={caixa}>
                {corpo}
              </button>
            ) : (
              <div className={caixa}>{corpo}</div>
            )}
          </div>
        );
      })}
      {doDia.length === 0 && (
        <div className="px-8 py-10 text-center text-text-muted">
          <b className="mb-1.5 block text-[17px] text-text">{t("Nada marcado")}</b>
          <p className="text-[14.5px]">{t("Este dia está livre na agenda.")}</p>
          {veAgenda && (
            <Link
              href="/app/agenda?criar=1"
              className="pele-foco mt-4 inline-flex min-h-(--mb-alvo) items-center rounded-xl px-4 text-sm font-bold text-accent-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]"
            >
              {t("Novo compromisso")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
