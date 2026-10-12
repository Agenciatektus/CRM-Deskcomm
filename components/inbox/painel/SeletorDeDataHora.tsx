"use client";

import { format } from "date-fns";
import { useId, useState } from "react";

import { Chip } from "@/components/ui/chip";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import {
  ATALHOS_DE_DIA,
  HORARIOS_SUGERIDOS,
  diaDoAtalho,
  diasDaGrade,
  horarioDigitado,
  juntaDiaEHora,
  mesmoDia,
  type AtalhoDeDia,
} from "./prazos";

const dois = (n: number) => String(n).padStart(2, "0");

const ROTULO_DO_ATALHO: Record<Exclude<AtalhoDeDia, "proximo_util">, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  em_7_dias: "Em 7 dias",
};

/**
 * Dia e horário numa peça só, no desenho do quadro DS ("Seletor de data e
 * horário"): atalhos primeiro (Hoje, Amanhã, o próximo dia útil, Em 7 dias),
 * o calendário com HOJE em anel e o passado riscado, os horários comuns em
 * chips e o campo "Outro horário", que aceita "1430". No mesmo dia, horário
 * que já passou fica desabilitado; o resumo embaixo diz o que foi escolhido.
 *
 * Mês e dia da semana saem do `Locale` do idioma em vigor, nunca de uma lista
 * em português escrita aqui.
 */
export function SeletorDeDataHora({
  valor,
  onEscolher,
  agora = new Date(),
  atalhos = true,
}: {
  valor: Date | null;
  onEscolher: (prazo: Date | null) => void;
  agora?: Date;
  /** Os chips de dia no topo. O adiar da conversa (Snooze) tem os próprios. */
  atalhos?: boolean;
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

  /** Escolher o dia mantém o horário quando ele ainda cabe nesse dia. */
  function escolheDia(d: Date) {
    if (d.getMonth() !== mes.getMonth() || d.getFullYear() !== mes.getFullYear()) setMes(d);
    aplica(d, hora && juntaDiaEHora(d, hora[0], hora[1]).getTime() > agora.getTime() ? hora : null);
  }

  const horaPassou = (h: number, m: number) => !!dia && juntaDiaEHora(dia, h, m).getTime() <= agora.getTime();
  const escolhido = dia && hora ? juntaDiaEHora(dia, hora[0], hora[1]) : null;
  const valido = !!escolhido && escolhido.getTime() > agora.getTime();
  const rotuloDoAtalho = (a: AtalhoDeDia) =>
    a === "proximo_util"
      ? format(diaDoAtalho(a, agora), "EEEE", { locale }).split("-")[0]!.replace(/^./, (l) => l.toUpperCase())
      : t(ROTULO_DO_ATALHO[a]);

  return (
    <div
      className="mt-2.5 rounded-lg border border-border-strong bg-surface p-3"
      role="group"
      aria-label={t("Escolher data e horário")}
    >
      {atalhos && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ATALHOS_DE_DIA.map((a) => {
            const d = diaDoAtalho(a, agora);
            return (
              <Chip key={a} className="flex-[1_0_auto]" ligado={!!dia && mesmoDia(dia, d)} onClick={() => escolheDia(d)}>
                {rotuloDoAtalho(a)}
              </Chip>
            );
          })}
        </div>
      )}
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md hover:bg-hover disabled:opacity-40"
          disabled={noMesAtual}
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          aria-label={t("Mês anterior")}
        >
          <CaretLeft size={14} aria-hidden />
        </button>
        <b className="text-ui capitalize" aria-live="polite">{format(mes, "LLLL yyyy", { locale })}</b>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md hover:bg-hover"
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          aria-label={t("Próximo mês")}
        >
          <CaretRight size={14} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5" aria-hidden>
        {semana.map((d) => (
          <span key={d.toISOString()} className="py-1 text-center text-[11.5px] font-bold text-text-subtle">
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
              aria-current={mesmoDia(d, agora) ? "date" : undefined}
              aria-label={format(d, "PPPP", { locale })}
              onClick={() => escolheDia(d)}
              className={cn(
                // `.dp-day` do quadro: 34px, raio 9; hoje em anel de 1,5px na marca;
                // passado riscado e apagado; escolhido cheio (degradê no escuro).
                "pele-grad-ativo h-8.5 rounded-control text-[13.5px] tabular-nums text-text transition-colors hover:bg-hover",
                "disabled:cursor-not-allowed disabled:text-[color-mix(in_oklch,var(--color-text-subtle)_45%,transparent)] disabled:line-through disabled:decoration-[color-mix(in_oklch,var(--color-text-subtle)_30%,transparent)] disabled:hover:bg-transparent",
                d.getMonth() !== mes.getMonth() && "text-text-subtle",
                mesmoDia(d, agora) && "font-bold text-accent-text shadow-[inset_0_0_0_1.5px_var(--color-accent)]",
                marcado && "bg-accent font-bold text-accent-foreground shadow-none hover:bg-accent",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mb-1.5 mt-3 text-[12.5px] font-bold text-text-muted">{t("Horário")}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {HORARIOS_SUGERIDOS.map(([h, m]) => (
          <Chip
            key={`${h}:${m}`}
            className="px-0 tabular-nums"
            disabled={!dia || horaPassou(h, m)}
            ligado={!!hora && hora[0] === h && hora[1] === m}
            onClick={() => {
              setOutro("");
              aplica(dia, [h, m]);
            }}
          >
            {dois(h)}:{dois(m)}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={idDoOutro} className="text-[12.5px] text-text-subtle">{t("Outro horário")}</label>
        <input
          id={idDoOutro}
          inputMode="numeric"
          maxLength={5}
          placeholder="1430"
          value={outro}
          disabled={!dia}
          aria-invalid={outroInvalido || undefined}
          onChange={(e) => {
            setOutro(e.target.value);
            const h = horarioDigitado(e.target.value);
            if (h) aplica(dia, h);
          }}
          className="h-8 w-21 rounded-field border border-border bg-surface-elevated text-center text-ui tabular-nums focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-accent-soft aria-[invalid=true]:border-error disabled:opacity-55"
        />
        {outroInvalido && <span className="text-meta text-error-fg">{t("Use hh:mm ou 1430.")}</span>}
      </div>
      <div
        className={cn(
          "mt-3 flex items-center gap-2 rounded-control px-2.75 py-2.25 text-[13.5px]",
          valido ? "bg-accent-soft font-bold text-accent-text" : "bg-surface-elevated font-medium text-text-subtle",
        )}
      >
        {valido && escolhido
          ? `${format(escolhido, "EEEE, dd/MM", { locale }).replace(/^./, (l) => l.toUpperCase())} ${t("às")} ${format(escolhido, "HH:mm")}`
          : t("Escolha o dia e o horário.")}
      </div>
    </div>
  );
}
