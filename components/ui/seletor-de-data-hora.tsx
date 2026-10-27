"use client";

import { format } from "date-fns";
import { useId, useState } from "react";

import { Chip } from "@/components/ui/chip";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import {
  ATALHOS_DE_DIA,
  HORARIOS_SUGERIDOS,
  diaDoAtalho,
  horarioDigitado,
  juntaDiaEHora,
  mesmoDia,
  type AtalhoDeDia,
} from "@/lib/ui/calendario";
import { cn } from "@/lib/utils";

import { GradeDoCalendario } from "./grade-do-calendario";

const dois = (n: number) => String(n).padStart(2, "0");
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const maiuscula = (s: string) => s.replace(/^./, (l) => l.toUpperCase());

const ROTULO_DO_ATALHO: Record<Exclude<AtalhoDeDia, "proximo_util">, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  em_7_dias: "Em 7 dias",
};

export type ModoDoSeletor = "data-hora" | "data" | "hora";

/**
 * Dia e horário numa peça só, no desenho do quadro DS ("Seletor de data e
 * horário"): atalhos primeiro (Hoje, Amanhã, o próximo dia útil, Em 7 dias),
 * o calendário com HOJE em anel, os horários comuns em chips e o campo "Outro
 * horário", que aceita "1430". O resumo embaixo diz o que foi escolhido.
 *
 * - `modo`: `data-hora` (padrão), só `data` (escolher o dia já responde) ou só
 *   `hora` (sem calendário; o dia é o de `valor`, ou hoje).
 * - `passado`: por padrão o seletor serve a PRAZO (tarefa, lembrete, adiar):
 *   dia que passou fica riscado e, no mesmo dia, horário que passou fica
 *   desabilitado. Campo de filtro, nascimento ou lançamento liga `passado`.
 * - `min`/`max`: limite de dia, como o `min`/`max` do campo nativo.
 *
 * Mês e dia da semana saem do `Locale` do idioma em vigor, nunca de uma lista
 * em português escrita aqui.
 */
export function SeletorDeDataHora({
  valor,
  onEscolher,
  agora = new Date(),
  atalhos = true,
  modo = "data-hora",
  passado = false,
  min = null,
  max = null,
  className,
}: {
  valor: Date | null;
  onEscolher: (prazo: Date | null) => void;
  agora?: Date;
  /** Os chips de dia no topo. O adiar da conversa (Snooze) tem os próprios. */
  atalhos?: boolean;
  modo?: ModoDoSeletor;
  passado?: boolean;
  min?: Date | null;
  max?: Date | null;
  className?: string;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  const idDoOutro = useId();
  const soHora = modo === "hora";
  const soData = modo === "data";
  const livre = passado || soHora;
  const [mes, setMes] = useState(() => valor ?? (min && min > agora ? min : max && max < agora ? max : agora));
  const [dia, setDia] = useState<Date | null>(soHora ? (valor ?? agora) : valor);
  const [hora, setHora] = useState<[number, number] | null>(valor ? [valor.getHours(), valor.getMinutes()] : null);
  const [outro, setOutro] = useState("");
  const outroInvalido = outro.trim() !== "" && horarioDigitado(outro) === null;

  const hoje = inicioDoDia(agora);
  const piso = min ? inicioDoDia(min) : livre ? null : hoje;
  const teto = max ? inicioDoDia(max) : null;
  const foraDoLimite = (d: Date) => (!!piso && d.getTime() < piso.getTime()) || (!!teto && d.getTime() > teto.getTime());
  const podeVoltar = !piso || new Date(mes.getFullYear(), mes.getMonth(), 1).getTime() > piso.getTime();
  const podeAvancar = !teto || new Date(mes.getFullYear(), mes.getMonth() + 1, 1).getTime() <= teto.getTime();
  // Ano a ano: só enquanto o mês de destino ainda tem dia dentro do limite.
  const podeVoltarAno = !piso || new Date(mes.getFullYear() - 1, mes.getMonth() + 1, 1).getTime() > piso.getTime();
  const podeAvancarAno = !teto || new Date(mes.getFullYear() + 1, mes.getMonth(), 1).getTime() <= teto.getTime();

  // `min`/`max` com horário (campo de data e hora, ou só horário) limitam
  // também o horário do mesmo dia, não só o dia (P2 do Cassio na #170).
  const noLimite = (p: Date) =>
    soData || ((!min || p.getTime() >= min.getTime()) && (!max || p.getTime() <= max.getTime()));
  const cabe = (d: Date) => (livre || d.getTime() > agora.getTime()) && noLimite(d);

  function aplica(d: Date | null, h: [number, number] | null) {
    setDia(d);
    setHora(h);
    if (soData) return onEscolher(d ? inicioDoDia(d) : null);
    const prazo = d && h ? juntaDiaEHora(d, h[0], h[1]) : null;
    onEscolher(prazo && cabe(prazo) ? prazo : null);
  }

  /** Escolher o dia mantém o horário quando ele ainda cabe nesse dia. */
  function escolheDia(d: Date) {
    if (d.getMonth() !== mes.getMonth() || d.getFullYear() !== mes.getFullYear()) setMes(d);
    aplica(d, hora && cabe(juntaDiaEHora(d, hora[0], hora[1])) ? hora : null);
  }

  const horaPassou = (h: number, m: number) => !!dia && !cabe(juntaDiaEHora(dia, h, m));
  const digitado = horarioDigitado(outro);
  const outroForaDoLimite = !!dia && !!digitado && !cabe(juntaDiaEHora(dia, digitado[0], digitado[1]));
  const escolhido = soData ? dia : dia && hora ? juntaDiaEHora(dia, hora[0], hora[1]) : null;
  const valido = !!escolhido && (soData || cabe(escolhido));
  const rotuloDoAtalho = (a: AtalhoDeDia) =>
    a === "proximo_util" ? maiuscula(format(diaDoAtalho(a, agora), "EEEE", { locale }).split("-")[0]!) : t(ROTULO_DO_ATALHO[a]);
  const formatoDoDia = passado ? "EEEE, dd/MM/yyyy" : "EEEE, dd/MM";
  const resumo = !valido || !escolhido
    ? t(soData ? "Escolha o dia." : soHora ? "Escolha o horário." : "Escolha o dia e o horário.")
    : soData
      ? maiuscula(format(escolhido, formatoDoDia, { locale }))
      : soHora
        ? format(escolhido, "HH:mm")
        : `${maiuscula(format(escolhido, formatoDoDia, { locale }))} ${t("às")} ${format(escolhido, "HH:mm")}`;

  return (
    <div
      className={cn("mt-2.5 rounded-lg border border-border-strong bg-surface p-3", className)}
      role="group"
      aria-label={t(soData ? "Escolher data" : soHora ? "Escolher horário" : "Escolher data e horário")}
    >
      {atalhos && !soHora && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ATALHOS_DE_DIA.map((a) => {
            const d = diaDoAtalho(a, agora);
            return (
              <Chip
                key={a}
                className="flex-[1_0_auto]"
                ligado={!!dia && mesmoDia(dia, d)}
                disabled={foraDoLimite(d)}
                onClick={() => escolheDia(d)}
              >
                {rotuloDoAtalho(a)}
              </Chip>
            );
          })}
        </div>
      )}
      {!soHora && (
        <GradeDoCalendario
          mes={mes}
          setMes={setMes}
          dia={dia}
          agora={agora}
          locale={locale}
          foraDoLimite={foraDoLimite}
          podeVoltar={podeVoltar}
          podeAvancar={podeAvancar}
          anos={passado}
          podeVoltarAno={podeVoltarAno}
          podeAvancarAno={podeAvancarAno}
          onDia={escolheDia}
        />
      )}
      {!soData && (
        <>
          <div className={cn("mb-1.5 text-[12.5px] font-bold text-text-muted", !soHora && "mt-3")}>{t("Horário")}</div>
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
              aria-invalid={outroInvalido || outroForaDoLimite || undefined}
              onChange={(e) => {
                setOutro(e.target.value);
                const h = horarioDigitado(e.target.value);
                if (h) aplica(dia, h);
              }}
              className="h-8 w-21 rounded-field border border-border bg-surface-elevated text-center text-ui tabular-nums focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-accent-soft aria-[invalid=true]:border-error disabled:opacity-55"
            />
            {outroInvalido && <span className="text-meta text-error-fg">{t("Use hh:mm ou 1430.")}</span>}
            {outroForaDoLimite && <span className="text-meta text-error-fg">{t("Fora do limite permitido.")}</span>}
          </div>
        </>
      )}
      <div
        className={cn(
          "mt-3 flex items-center gap-2 rounded-control px-2.75 py-2.25 text-[13.5px]",
          valido ? "bg-accent-soft font-bold text-accent-text" : "bg-surface-elevated font-medium text-text-subtle",
        )}
      >
        {resumo}
      </div>
    </div>
  );
}
