"use client";
import { format } from "date-fns";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SeletorDeDataHora } from "@/components/inbox/painel/SeletorDeDataHora";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";
import { lembreteAtivo, opcoesDoLembrete, quandoDoLembrete } from "@/lib/inbox/opcoes-do-lembrete";
import { Alarm, CalendarBlank } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  conversationId: string;
  snoozeUntil: string | null;
  disabled?: boolean;
}

const ITEM =
  "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-hidden disabled:opacity-50";

/**
 * "Lembrar depois", em popover.
 *
 * Era um menu com três durações redondas (1, 3 e 24 horas). Quem atende pensa
 * em HORÁRIO ("amanhã cedo", "no fim do dia"), não em horas a somar de cabeça,
 * e por isso cada opção mostra ao lado o horário que ela vai dar, calculado no
 * fuso de quem clica (`opcoesDoLembrete`). A rota recebe o instante pronto.
 *
 * Popover e não menu porque "Escolher data e hora" abre um calendário DENTRO
 * dele, e um menu fecha no primeiro clique.
 */
export function SnoozeButton({ conversationId, snoozeUntil, disabled }: Props) {
  const t = useT();
  const locale = useLocaleDeData();
  const { snooze, cancel } = useSnoozeConversation();
  const [aberto, setAberto] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [escolhido, setEscolhido] = useState<Date | null>(null);
  // O relógio é lido quando o popover abre, não a cada render: as opções não
  // podem mudar de horário enquanto a pessoa decide.
  const [agora, setAgora] = useState(() => new Date());
  const ativo = lembreteAtivo(snoozeUntil, agora);
  const ocupado = snooze.isPending || cancel.isPending;
  // Com lembrete valendo, o NOME do botão diz quando: a cor do ícone sozinha
  // não chega a quem usa leitor de tela.
  const rotulo =
    ativo && snoozeUntil
      ? `${t("Lembrete ativo:")} ${quandoDoLembrete(new Date(snoozeUntil), agora, locale, t)}`
      : t("Lembrar depois");

  function alternar(v: boolean) {
    if (v) setAgora(new Date());
    if (!v) {
      setEscolhendo(false);
      setEscolhido(null);
    }
    setAberto(v);
  }

  function lembrar(quando: Date) {
    snooze.mutate(
      { conversation_id: conversationId, snooze_until: quando.toISOString() },
      { onSuccess: () => alternar(false) },
    );
  }

  return (
    <Popover open={aberto} onOpenChange={alternar}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || ocupado}
          className={cn("w-9 px-0", ativo && "text-accent")}
          aria-label={rotulo}
          title={rotulo}
        >
          <Alarm size={18} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-xs font-semibold text-text-muted">
          {t("Me lembrar desta conversa")}
        </p>
        {opcoesDoLembrete(agora).map((o) => (
          <button
            key={o.id}
            type="button"
            className={ITEM}
            disabled={ocupado}
            onClick={() => lembrar(o.quando)}
          >
            <span className="flex-1">{t(o.rotulo)}</span>
            <span className="text-xs tabular-nums text-text-muted">
              {o.id === "em_1_semana" ? format(o.quando, "EEE d MMM, p", { locale }) : format(o.quando, "p", { locale })}
            </span>
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          className={ITEM}
          aria-expanded={escolhendo}
          onClick={() => setEscolhendo((v) => !v)}
        >
          <CalendarBlank size={14} aria-hidden />
          <span className="flex-1">{t("Escolher data e hora")}</span>
        </button>
        {escolhendo && (
          <div className="px-1 pb-1">
            <SeletorDeDataHora valor={escolhido} onEscolher={setEscolhido} agora={agora} />
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={!escolhido || ocupado}
              onClick={() => escolhido && lembrar(escolhido)}
            >
              {t("Lembrar neste horário")}
            </Button>
          </div>
        )}
        {ativo && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              className={cn(ITEM, "text-error-fg")}
              disabled={ocupado}
              onClick={() =>
                cancel.mutate({ conversation_id: conversationId }, { onSuccess: () => alternar(false) })
              }
            >
              {t("Cancelar lembrete")}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
