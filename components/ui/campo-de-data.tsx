"use client";

import { format, isValid, parse } from "date-fns";
import * as React from "react";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { CalendarBlank, Clock, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { SeletorDeDataHora, type ModoDoSeletor } from "./seletor-de-data-hora";

/**
 * O campo de data/hora do design system no lugar do `<input type="date">`,
 * `type="time"` e `type="datetime-local"` (regra 6 do quadro). Abre o
 * `SeletorDeDataHora` (atalhos, calendário, horários) num popover.
 *
 * O VALOR é o mesmo texto que o campo nativo usava (`2026-10-12`, `14:30`,
 * `2026-10-12T14:30`), então a troca não mexe em estado, rota nem validação.
 *
 * O `<input>` ESCONDIDO leva `name`, `required` e `form` (server action e
 * `FormData` recebem o mesmo texto) e o `data-testid`, e repassa a mudança
 * digitada nele (preenchimento automático, `fill` do Playwright). Fica fora da
 * árvore de acessibilidade e do Tab; quem usa teclado fala com o gatilho, que
 * recebe `id` e os `aria-*`.
 */
export type TipoDoCampoDeData = "date" | "time" | "datetime-local";

const FORMATO: Record<TipoDoCampoDeData, string> = {
  date: "yyyy-MM-dd",
  time: "HH:mm",
  "datetime-local": "yyyy-MM-dd'T'HH:mm",
};
const EXIBICAO: Record<TipoDoCampoDeData, string> = {
  date: "dd/MM/yyyy",
  time: "HH:mm",
  "datetime-local": "dd/MM/yyyy HH:mm",
};
const MODO: Record<TipoDoCampoDeData, ModoDoSeletor> = { date: "data", time: "hora", "datetime-local": "data-hora" };

/** Lê o texto do campo nativo (aceita segundos no `time`/`datetime-local`). */
export function lerValorDoCampo(tipo: TipoDoCampoDeData, valor: string | undefined | null): Date | null {
  if (!valor) return null;
  const texto = tipo === "date" ? valor.slice(0, 10) : tipo === "time" ? valor.slice(0, 5) : valor.slice(0, 16);
  const d = parse(texto, FORMATO[tipo], new Date());
  return isValid(d) ? d : null;
}

export function escreverValorDoCampo(tipo: TipoDoCampoDeData, d: Date | null): string {
  return d ? format(d, FORMATO[tipo]) : "";
}

export interface CampoDeDataProps {
  tipo: TipoDoCampoDeData;
  value?: string;
  defaultValue?: string;
  onValorChange?: (valor: string) => void;
  /** `min`/`max` no formato do campo nativo (só o dia conta). */
  min?: string;
  max?: string;
  /** Por padrão aceita o passado (filtro, nascimento, lançamento). Prazo desliga. */
  passado?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  onBlur?: () => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
}

export const CampoDeData = React.forwardRef<HTMLButtonElement, CampoDeDataProps>(function CampoDeData(
  {
    tipo,
    value,
    defaultValue,
    onValorChange,
    min,
    max,
    passado = true,
    placeholder,
    id,
    name,
    form,
    required,
    disabled,
    className,
    title,
    onBlur,
    "data-testid": testId,
    ...aria
  },
  ref,
) {
  const t = useT();
  const locale = useLocaleDeData();
  const [aberto, setAberto] = React.useState(false);
  const [interno, setInterno] = React.useState(defaultValue ?? "");
  const atual = value ?? interno;
  const data = lerValorDoCampo(tipo, atual);
  const Icone = tipo === "time" ? Clock : CalendarBlank;

  function mudar(v: string) {
    if (value === undefined) setInterno(v);
    onValorChange?.(v);
  }

  const rotuloPadrao = tipo === "time" ? t("Escolher horário") : tipo === "date" ? t("Escolher data") : t("Escolher data e horário");

  return (
    <span className={cn("relative inline-flex w-full min-w-0 items-center", className)}>
      <Popover
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) onBlur?.();
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            id={id}
            title={title}
            disabled={disabled}
            data-campo-de-data={tipo}
            {...aria}
            className={cn(
              "pele-foco flex h-full min-h-9.5 w-full items-center gap-2 whitespace-nowrap rounded-field border border-border bg-surface-elevated px-2.75 text-left text-ui text-text tabular-nums transition-[border-color,box-shadow,background-color] duration-ui hover:border-border-strong focus:outline-hidden focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-3 focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-error aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-error-bg",
              data && !required && !disabled && "pr-8",
            )}
          >
            <Icone size={15} className="shrink-0 text-text-subtle" aria-hidden />
            <span className={cn("truncate", !data && "text-text-subtle")}>
              {data ? format(data, EXIBICAO[tipo], { locale }) : (placeholder ?? rotuloPadrao)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-0">
          <SeletorDeDataHora
            valor={data}
            modo={MODO[tipo]}
            passado={passado}
            min={lerValorDoCampo(tipo === "time" ? "date" : tipo, min ?? null)}
            max={lerValorDoCampo(tipo === "time" ? "date" : tipo, max ?? null)}
            className="mt-0 border-0"
            onEscolher={(d) => {
              if (!d) return;
              mudar(escreverValorDoCampo(tipo, d));
              if (tipo === "date") setAberto(false);
            }}
          />
          {tipo !== "date" && (
            <div className="flex justify-end px-3 pb-3">
              <Button type="button" size="sm" onClick={() => setAberto(false)}>
                {t("Pronto")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {data && !required && !disabled && (
        <button
          type="button"
          className="absolute right-1.5 grid size-6 place-items-center rounded-md text-text-subtle hover:bg-hover hover:text-text"
          aria-label={t("Limpar")}
          onClick={() => mudar("")}
        >
          <X size={13} aria-hidden />
        </button>
      )}
      <input
        data-campo-nativo=""
        aria-hidden
        tabIndex={-1}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        data-testid={testId}
        value={atual}
        onChange={(e) => mudar(e.target.value)}
        className="sr-only"
      />
    </span>
  );
});
