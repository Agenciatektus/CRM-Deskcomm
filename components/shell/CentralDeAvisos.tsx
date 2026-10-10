"use client";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import type { ComponentType } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  useAgentInbox,
  useResolveAllInboxItems,
  useUpdateInboxItem,
  type AgentInboxItem,
} from "@/hooks/ai/useAgentInbox";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { kindLabel } from "@/lib/ai/agent-inbox-copy";
import { Alarm, ArrowsClockwise, CalendarCheck, Check, Plugs, Sparkle, UserMinus, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** O limite que a rota aplica por padrão (`/api/v1/ai/inbox`, `limit` = 50). */
const LIMITE_DA_LISTA = 50;

type Tom = "accent" | "crit" | "warn" | "muted";

const CLASSE_DO_TOM: Record<Tom, string> = {
  accent: "bg-accent-soft text-accent-700 dark:text-accent-300",
  crit: "bg-error-bg text-error-fg",
  warn: "bg-warning-bg text-warning-fg",
  muted: "bg-surface-elevated text-text-subtle",
};

type Icone = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

/**
 * Ícone e tom por TIPO de aviso, como o `.av-ic` do protótipo (handoff, sem
 * dono, QR, resultado de compromisso, lembrete, outros). Tipo sem par aqui cai
 * no tom da GRAVIDADE, que todo aviso tem: o crítico nunca sai cinza.
 */
function aparencia(item: AgentInboxItem): { Icone: Icone; tom: Tom } {
  switch (item.kind) {
    case "handoff":
    case "jev_pedido_de_humano":
      return { Icone: Sparkle, tom: "accent" };
    case "routing_unassigned":
      return { Icone: UserMinus, tom: "crit" };
    case "qr_rescan":
    case "channel_number_alert":
      return { Icone: Plugs, tom: "crit" };
    case "appointment_outcome_required":
      return { Icone: CalendarCheck, tom: "warn" };
    case "snooze_expired":
    case "task_due":
      return { Icone: Alarm, tom: "warn" };
    default:
      return {
        Icone: item.severity === "info" ? ArrowsClockwise : Warning,
        tom: item.severity === "critical" ? "crit" : item.severity === "warn" ? "warn" : "muted",
      };
  }
}

/**
 * O CONTEÚDO do popover do sino: a mesma central de `/app/ai/inbox`, em tamanho
 * de bolso (T13-T20 da auditoria do visual v2).
 *
 * Mesmas fontes da página (`useAgentInbox`, PATCH de status e resolve-all) e a
 * mesma regra de quem resolve (`agent+`, decidida por quem monta). Título e
 * corpo do aviso saem como vieram, nunca por `t()`: são linhas escritas pelo
 * runtime com nome de cliente e motivo (ver `AgentInboxList`).
 */
export function CentralDeAvisos({ podeResolver, onFechar }: { podeResolver: boolean; onFechar: () => void }) {
  const t = useT();
  const [aba, setAba] = useState<"open" | "resolved">("open");
  const abertos = useAgentInbox("open");
  const resolvidos = useAgentInbox("resolved");
  const atual = aba === "open" ? abertos : resolvidos;
  const itens = atual.data?.items ?? [];
  const atualizar = useUpdateInboxItem();
  const resolverTodos = useResolveAllInboxItems();
  const nAbertos = abertos.data?.open_count ?? 0;
  // "Resolvidos N" só com a lista INTEIRA na mão: a rota devolve no máximo 50,
  // e com 50 não há como saber se existem mais. Contagem inventada é pior que
  // nenhuma.
  const listaDeResolvidos = resolvidos.data?.items;
  const nResolvidos =
    listaDeResolvidos && listaDeResolvidos.length < LIMITE_DA_LISTA ? listaDeResolvidos.length : null;

  return (
    <div className="flex max-h-[min(620px,calc(100dvh-72px))] flex-col" role="dialog" aria-label={t("Central de avisos")}>
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <h2 className="flex-1 text-[15px] font-bold text-text">{t("Central de avisos")}</h2>
        {podeResolver && aba === "open" && itens.length > 1 && (
          <button
            type="button"
            className="text-xs font-semibold text-accent-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-accent-300"
            disabled={resolverTodos.isPending}
            onClick={() => resolverTodos.mutate()}
          >
            {t("Marcar todos resolvidos")}
          </button>
        )}
      </div>
      <div className="flex gap-0.5 border-b border-border px-3 pt-2" role="tablist">
        {(
          [
            ["open", `${t("Abertos")} ${nAbertos}`],
            ["resolved", nResolvidos === null ? t("Resolvidos") : `${t("Resolvidos")} ${nResolvidos}`],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={cn(
              "relative h-9 px-2 text-[13px] font-semibold text-text-muted hover:text-text",
              aba === valor &&
                "text-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent dark:after:bg-(image:--pele-grad)",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {(atualizar.isError || resolverTodos.isError) && (
        <p role="alert" className="px-4 pt-2 text-xs text-error-fg">
          {t("Não foi possível atualizar este aviso. Tente novamente.")}
        </p>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="central-de-avisos-lista">
        {atual.isLoading ? (
          <li className="px-4 py-6 text-center text-sm text-text-muted">{t("Carregando…")}</li>
        ) : atual.isError ? (
          <li className="px-4 py-6 text-center text-sm text-text-muted">
            {t("Não foi possível carregar os avisos. Tente novamente.")}
          </li>
        ) : itens.length === 0 ? (
          <li className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
            <Check size={28} className="text-success-fg" aria-hidden />
            <strong className="text-sm text-text">
              {aba === "open" ? t("Nenhum aviso em aberto") : t("Nenhum aviso resolvido")}
            </strong>
            <span className="text-xs text-text-muted">
              {aba === "open"
                ? t("Quando o assistente precisar de você, o aviso aparece aqui.")
                : t("Avisos que você marcar como resolvidos ficam aqui.")}
            </span>
          </li>
        ) : (
          itens.map((item) => (
            <ItemDoAviso
              key={item.id}
              item={item}
              podeResolver={podeResolver}
              pendente={atualizar.isPending}
              onStatus={(status) => atualizar.mutate({ id: item.id, status })}
              onNavegar={onFechar}
            />
          ))
        )}
      </ul>
      <div className="border-t border-border px-4 py-2.5 text-center">
        <Link
          href="/app/ai/inbox"
          onClick={onFechar}
          className="text-xs font-semibold text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
        >
          {t("Abrir a central completa")}
        </Link>
      </div>
    </div>
  );
}

function ItemDoAviso({
  item,
  podeResolver,
  pendente,
  onStatus,
  onNavegar,
}: {
  item: AgentInboxItem;
  podeResolver: boolean;
  pendente: boolean;
  onStatus: (status: "open" | "resolved") => void;
  onNavegar: () => void;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  const { Icone, tom } = aparencia(item);
  const aberto = item.status !== "resolved";
  const quando = formatDistanceToNowStrict(new Date(item.created_at), { addSuffix: true, locale });
  return (
    <li className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3.5 last:border-b-0" data-testid="central-de-avisos-item">
      <span className={cn("grid h-[34px] w-[34px] place-items-center rounded-lg", CLASSE_DO_TOM[tom])}>
        <Icone size={17} aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <b className="min-w-0 flex-1 break-words text-sm leading-snug text-text">{item.title}</b>
          <time className="shrink-0 whitespace-nowrap text-xs text-text-subtle" dateTime={item.created_at}>
            {quando}
          </time>
        </div>
        <p className="mt-0.5 break-words text-[13px] leading-snug text-text-muted">
          {item.body ?? kindLabel(item.kind, t)}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {aberto && item.destination.estado === "disponivel" && (
            <Button asChild size="sm" className="h-7 px-2.5 text-xs">
              <Link href={item.destination.href} onClick={onNavegar}>
                {t(item.destination.rotulo)}
              </Link>
            </Button>
          )}
          <span className="flex-1" />
          {podeResolver &&
            (aberto ? (
              <button
                type="button"
                disabled={pendente}
                onClick={() => onStatus("resolved")}
                aria-label={t("Marcar resolvido")}
                title={t("Marcar resolvido")}
                className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border text-text-subtle hover:border-success hover:bg-success-bg hover:text-success-fg disabled:opacity-60"
              >
                <Check size={15} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                disabled={pendente}
                onClick={() => onStatus("open")}
                className="text-xs font-semibold text-accent-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-accent-300"
              >
                {t("Reabrir")}
              </button>
            ))}
        </div>
      </div>
    </li>
  );
}
