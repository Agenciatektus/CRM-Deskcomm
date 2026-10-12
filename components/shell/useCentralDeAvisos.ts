"use client";
import { toast } from "sonner";
import type { ComponentType } from "react";
import { useState } from "react";

import {
  useAgentInbox,
  useResolveAllInboxItems,
  useUpdateInboxItem,
  type AgentInboxItem,
} from "@/hooks/ai/useAgentInbox";
import { avisarComDesfazer } from "@/lib/ui/aviso-com-desfazer";
import { Alarm, ArrowsClockwise, CalendarCheck, Plugs, Sparkle, UserMinus, Warning } from "@/lib/ui/icons";

/** O limite que a rota aplica por padrão (`/api/v1/ai/inbox`, `limit` = 50). */
export const LIMITE_DA_LISTA = 50;

export type Tom = "accent" | "crit" | "warn" | "muted";

export const CLASSE_DO_TOM: Record<Tom, string> = {
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
export function aparencia(item: AgentInboxItem): { Icone: Icone; tom: Tom } {
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

/** O desfecho do compromisso direto no aviso (Compareceu, Faltou, Remarcou), para quem resolve. */
export function pedeDesfecho(item: AgentInboxItem, podeResolver: boolean): boolean {
  return (
    item.status !== "resolved" &&
    podeResolver &&
    item.kind === "appointment_outcome_required" &&
    item.ref_kind === "appointment" &&
    !!item.ref_id
  );
}

/**
 * O ESTADO da central de avisos, o mesmo no popover do sino (desktop) e na aba Avisos
 * do celular: as duas listas (`useAgentInbox`), o PATCH de status, o `resolve-all` e as
 * contagens. Nenhuma consulta nova: as chaves são as do sino e da barra inferior.
 *
 * `listaCompleta`: a rota devolve no máximo 50. Só com MENOS que isso, e todos os
 * abertos carregados, a tela sabe que tem a lista inteira, e só então o Desfazer
 * do "Marcar todos resolvidos" consegue reabrir tudo (P2-3 do Cassio na #169).
 */
export function useCentralDeAvisos(t: (texto: string) => string) {
  const [aba, setAba] = useState<"open" | "resolved">("open");
  const abertos = useAgentInbox("open");
  const resolvidos = useAgentInbox("resolved");
  const atual = aba === "open" ? abertos : resolvidos;
  const atualizar = useUpdateInboxItem();
  const resolverTodos = useResolveAllInboxItems();
  const nAbertos = abertos.data?.open_count ?? 0;
  // "Resolvidos N" só com a lista INTEIRA na mão: com 50 não há como saber se
  // existem mais. Contagem inventada é pior que nenhuma.
  const listaDeResolvidos = resolvidos.data?.items;
  const nResolvidos =
    listaDeResolvidos && listaDeResolvidos.length < LIMITE_DA_LISTA ? listaDeResolvidos.length : null;
  const carregados = abertos.data?.items ?? [];
  const listaCompleta = carregados.length < LIMITE_DA_LISTA && carregados.length >= nAbertos;

  /** `avisarErro`: quem não tem onde mostrar o erro na tela (o ⋯ do celular) avisa por toast. */
  function marcarTodosResolvidos(opcoes: { avisarErro?: boolean } = {}) {
    // O Desfazer reabre um por vez os ids que a tela carregou; só é oferecido com
    // a lista completa (com mais abertos, a tela não teria como reabrir os que não vieram).
    const completa = listaCompleta;
    const ids = carregados.map((i) => i.id);
    resolverTodos.mutate(undefined, {
      onSuccess: () => {
        if (completa) {
          avisarComDesfazer(t("Avisos marcados como resolvidos."), t("Desfazer"), () =>
            Promise.all(ids.map((id) => atualizar.mutateAsync({ id, status: "open" }))),
          );
        } else {
          toast.success(t("Avisos marcados como resolvidos."));
        }
      },
      onError: () => {
        if (opcoes.avisarErro) toast.error(t("Não foi possível atualizar este aviso. Tente novamente."));
      },
    });
  }

  return {
    aba,
    setAba,
    atual,
    itens: atual.data?.items ?? [],
    nAbertos,
    nResolvidos,
    listaCompleta,
    atualizar,
    resolverTodos,
    marcarTodosResolvidos,
  };
}
