"use client";

import { format } from "date-fns";
import { useId, useState } from "react";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, CaretLeft, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { HORARIOS_SUGERIDOS, diasDaGrade, horarioDigitado, juntaDiaEHora, mesmoDia } from "./prazos";

const dois = (n: number) => String(n).padStart(2, "0");

/**
 * Dia e horário numa peça só, dentro do painel.
 *
 * O repositório não tinha seletor de calendário reaproveitável (o
 * `CalendarioDeTarefas` é a visão do mês da tela de Tarefas, não um campo), e o
 * `<input type="datetime-local">` nativo abre um popup de tamanho do sistema que
 * não cabe na coluna de 296px nem segue o tema. Daí esta grade enxuta, nos
 * tokens do CRM.
 *
 * Dia passado e horário já passado de hoje ficam DESABILITADOS: prazo no
 * passado nasce como tarefa atrasada, e o painel acenderia o alerta sobre um
 * compromisso que acabou de ser marcado.
 *
 * Mês e dia da semana saem do `Locale` do idioma em vigor, nunca de uma lista
 * em português escrita aqui.
 */
export function SeletorDeDataHora({ valor, onEscolher, agora = new Date() }: {
  valor: Date | null;
  onEscolher: (prazo: Date | null) => void;
  agora?: Date;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  const idDoOutro = useId();
  const [mes, setMes] = useState(() => valor ?? agora);
  const [dia, setDia] = useState<Date | null>(valor);
  const [hora, setHora] = useState<[number, number] | null>(valor ? [valor.getHours(), valor.getMinutes()] : null);
  const [outro, setOutro] = useState("");
  const outroInvalido = outro.trim() !== "" && horarioDigitado(outro) === null;

  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const noMesAtual = mes.getFullYear() === agora.getFullYear() && mes.getMonth() === agora.getMonth();
  const semana = diasDaGrade(mes).slice(0, 7);

  function aplica(d: Date | null, h: [number, number] | null) {
    setDia(d);
    setHora(h);
    const prazo = d && h ? juntaDiaEHora(d, h[0], h[1]) : null;
    onEscolher(prazo && prazo.getTime() > agora.getTime() ? prazo : null);
  }

  const horaPassou = (h: number, m: number) => !!dia && juntaDiaEHora(dia, h, m).getTime() <= agora.getTime();
  const escolhido = dia && hora ? juntaDiaEHora(dia, hora[0], hora[1]) : null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3" role="group" aria-label={t("Escolher data e horário")}>
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-elevated disabled:opacity-40"
          disabled={noMesAtual}
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          aria-label={t("Mês anterior")}
        >
          <CaretLeft size={14} aria-hidden />
        </button>
        <b className="text-xs capitalize" aria-live="polite">{format(mes, "LLLL yyyy", { locale })}</b>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-elevated"
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          aria-label={t("Próximo mês")}
        >
          <CaretRight size={14} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5" aria-hidden>
        {semana.map((d) => (
          <span key={d.toISOString()} className="py-1 text-center text-[11px] font-semibold uppercase text-text-muted">
            {format(d, "EEEEE", { locale })}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {diasDaGrade(mes).map((d) => {
          const passado = d.getTime() < hoje.getTime();
          const marcado = !!dia && mesmoDia(d, dia);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={passado}
              aria-pressed={marcado}
              aria-label={format(d, "PPPP", { locale })}
              onClick={() => aplica(d, hora && juntaDiaEHora(d, hora[0], hora[1]).getTime() > agora.getTime() ? hora : null)}
              className={cn(
                "h-8 rounded-md text-xs tabular-nums hover:bg-surface-elevated disabled:cursor-not-allowed disabled:text-text-subtle disabled:line-through",
                d.getMonth() !== mes.getMonth() && "text-text-muted",
                mesmoDia(d, agora) && "font-semibold text-accent ring-1 ring-inset ring-accent",
                marcado && "bg-accent font-semibold text-accent-fg ring-0 hover:bg-accent",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mb-1.5 mt-3 text-xs font-semibold text-text-muted">{t("Horário")}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {HORARIOS_SUGERIDOS.map(([h, m]) => {
          const marcado = !!hora && hora[0] === h && hora[1] === m;
          return (
            <button
              key={`${h}:${m}`}
              type="button"
              disabled={!dia || horaPassou(h, m)}
              aria-pressed={marcado}
              onClick={() => { setOutro(""); aplica(dia, [h, m]); }}
              className={cn(
                "h-7 rounded-full border border-border text-xs tabular-nums hover:border-border-strong disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-40",
                marcado && "border-accent bg-accent text-accent-fg",
              )}
            >
              {dois(h)}:{dois(m)}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={idDoOutro} className="text-xs text-text-muted">{t("Outro horário")}</label>
        <input
          id={idDoOutro}
          inputMode="numeric"
          maxLength={5}
          placeholder="hh:mm"
          value={outro}
          disabled={!dia}
          onChange={(e) => {
            setOutro(e.target.value);
            const h = horarioDigitado(e.target.value);
            if (h) aplica(dia, h);
          }}
          className="h-7 w-20 rounded-md border border-input bg-background text-center text-xs tabular-nums focus:outline-hidden focus:ring-1 focus:ring-ring"
        />
        {outroInvalido && <span className="text-xs font-medium text-error-fg">{t("Use o formato hh:mm.")}</span>}
      </div>
      <div
        className={cn(
          "mt-3 flex items-center gap-2 rounded-md px-2.5 py-2 text-xs",
          escolhido && escolhido.getTime() > agora.getTime() ? "bg-accent-soft font-semibold text-text" : "bg-surface-elevated text-text-muted",
        )}
      >
        <CalendarBlank size={14} aria-hidden />
        {escolhido && escolhido.getTime() > agora.getTime()
          ? format(escolhido, "PPPp", { locale })
          : t("Escolha o dia e o horário.")}
      </div>
    </div>
  );
}
