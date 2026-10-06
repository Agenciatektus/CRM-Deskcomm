"use client";
import { useEffect, useState, type ReactNode } from "react";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";
import { formatarDecorrido } from "@/lib/channels/janela";
import { lembreteAtivo, quandoDoLembrete } from "@/lib/inbox/opcoes-do-lembrete";
import { CLASSE_DO_TOM, tomDaEspera } from "@/lib/inbox/tom-da-espera";
import { Alarm, Clock, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** A pílula do visual v2, a mesma altura da linha da lista de conversas. */
const PILULA =
  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-medium";

interface Props {
  /** O selo da janela já montado pelo cabeçalho (é ele quem sabe o provider). */
  janela: ReactNode;
  conversationId: string;
  /** Desde quando o cliente espera resposta; `null` quando ninguém está esperando. */
  esperandoDesde: string | null;
  snoozeUntil: string | null;
  /** Por que o automático está parado, já traduzido; `null` quando ele não está. */
  motivo: string | null;
  /** Por onde a conversa entrou: hoje só o Instagram diz (`direct` ou `comentario`). */
  instagramEntrada: string | null;
  leitura: boolean;
}

/**
 * A FAIXA DE STATUS abaixo do cabeçalho: o que muda com o tempo.
 *
 * O cabeçalho diz QUEM é e QUEM atende; esta faixa diz QUANTO TEMPO: quanto
 * resta da janela, há quanto o cliente espera, quando volta o lembrete. Separar
 * as duas coisas tira do cabeçalho os selos que alargavam a linha do nome e
 * empurravam a barra de ações para baixo (#1625).
 *
 * "Entrou por" só aparece com dado de verdade no payload. Hoje isso é a entrada
 * do Instagram (Direct ou comentário); anúncio e campanha ainda não chegam à
 * conversa, e inventar uma origem seria pior que não mostrar nenhuma.
 */
export function FaixaDeStatus({
  janela,
  conversationId,
  esperandoDesde,
  snoozeUntil,
  motivo,
  instagramEntrada,
  leitura,
}: Props) {
  const t = useT();
  const locale = useLocaleDeData();
  const { cancel } = useSnoozeConversation();
  // Mesmo passo do `JanelaSelo`: o tom da espera muda em minutos, não segundos.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const esperaMs = esperandoDesde ? agora.getTime() - new Date(esperandoDesde).getTime() : null;
  const temEspera = esperaMs !== null && Number.isFinite(esperaMs) && esperaMs >= 0;
  const temLembrete = lembreteAtivo(snoozeUntil, agora);
  const origem =
    instagramEntrada === "direct"
      ? t("Direct do Instagram")
      : instagramEntrada === "comentario"
        ? t("Comentário no Instagram")
        : null;

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-1.5 empty:hidden"
      data-testid="faixa-de-status"
    >
      {janela}
      {temEspera && (
        <span
          className={cn(PILULA, "border-transparent", CLASSE_DO_TOM[tomDaEspera(esperandoDesde, agora)])}
          data-testid="faixa-espera"
          data-tom={tomDaEspera(esperandoDesde, agora)}
        >
          <Clock size={12} aria-hidden />
          {esperaMs < 60_000 ? t("Esperando agora") : `${t("Esperando há")} ${formatarDecorrido(esperaMs)}`}
        </span>
      )}
      {temLembrete && snoozeUntil && (
        <span className={cn(PILULA, "border-border bg-surface-elevated text-text")} data-testid="faixa-lembrete">
          <Alarm size={12} aria-hidden />
          {t("Lembrete:")} {quandoDoLembrete(new Date(snoozeUntil), agora, locale, t)}
          {!leitura && (
            <button
              type="button"
              // 24px visíveis e 32px de toque (o `before` estende a área): o X de
              // 20px era um alvo pequeno demais para o dedo e para quem treme.
              className="relative -mr-1.5 ml-0.5 grid h-6 w-6 place-items-center rounded-md before:absolute before:-inset-1 before:content-[''] hover:bg-border disabled:opacity-50"
              aria-label={t("Cancelar lembrete")}
              title={t("Cancelar lembrete")}
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ conversation_id: conversationId })}
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </span>
      )}
      {/* O testid é contrato: `escalacao-ciclo.spec.ts` e `inbox-quem-manda.spec.ts`
          o procuram. Sem esta marca, a conversa em que o robô está calado tem a
          mesma cara de uma conversa normal. */}
      {motivo !== null && (
        <span
          className={cn(PILULA, "max-w-full truncate border-border text-text-muted")}
          title={motivo}
          data-testid="badge-atendimento-humano"
        >
          {motivo}
        </span>
      )}
      {origem && (
        <span className={cn(PILULA, "ml-auto border-border text-text-muted")} data-testid="faixa-origem">
          {t("Entrou por")} {origem}
        </span>
      )}
    </div>
  );
}
