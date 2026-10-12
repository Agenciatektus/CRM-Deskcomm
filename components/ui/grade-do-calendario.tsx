"use client";

import { format, type Locale } from "date-fns";

import { useT } from "@/hooks/i18n/useT";
import { diasDaGrade, mesmoDia } from "@/lib/ui/calendario";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O mês do seletor de data (quadro DS, `.dp-day`): navegação, iniciais da
 * semana e a grade com HOJE em anel, o dia escolhido cheio e os dias fora do
 * limite riscados. Quem decide o limite é o seletor (`foraDoLimite`).
 */
export function GradeDoCalendario({
  mes,
  setMes,
  dia,
  agora,
  locale,
  foraDoLimite,
  podeVoltar,
  podeAvancar,
  onDia,
}: {
  mes: Date;
  setMes: (d: Date) => void;
  dia: Date | null;
  agora: Date;
  locale: Locale;
  foraDoLimite: (d: Date) => boolean;
  podeVoltar: boolean;
  podeAvancar: boolean;
  onDia: (d: Date) => void;
}) {
  const t = useT();
  const semana = diasDaGrade(mes).slice(0, 7);
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md hover:bg-hover disabled:opacity-40"
          disabled={!podeVoltar}
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          aria-label={t("Mês anterior")}
        >
          <CaretLeft size={14} aria-hidden />
        </button>
        <b className="text-ui capitalize" aria-live="polite">{format(mes, "LLLL yyyy", { locale })}</b>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md hover:bg-hover disabled:opacity-40"
          disabled={!podeAvancar}
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
          const marcado = !!dia && mesmoDia(d, dia);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={foraDoLimite(d)}
              aria-pressed={marcado}
              aria-current={mesmoDia(d, agora) ? "date" : undefined}
              aria-label={format(d, "PPPP", { locale })}
              onClick={() => onDia(d)}
              className={cn(
                // `.dp-day` do quadro: 34px, raio 9; hoje em anel de 1,5px na marca;
                // fora do limite riscado e apagado; escolhido cheio (degradê no escuro).
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
    </>
  );
}
