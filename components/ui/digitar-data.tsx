"use client";

import { isValid, parse } from "date-fns";
import { useId, useState } from "react";

import { useT } from "@/hooks/i18n/useT";

/**
 * Digitar a data em vez de clicar mês a mês (P2 do Cassio na #170: data de
 * nascimento em 1985 pedia dezenas de cliques). Aceita `dd/mm/aaaa` e, no campo
 * de data e hora, `dd/mm/aaaa hh:mm`; também sem as barras (`12101985`).
 * Só responde quando o texto forma uma data válida dentro do limite.
 */
const FORMATOS_DE_DIA = ["dd/MM/yyyy", "ddMMyyyy", "d/M/yyyy"];
/** Antes disso é engano de digitação, não data de nascimento (P2 do Cassio na #171). */
export const ANO_MINIMO = 1900;

export function lerDataDigitada(texto: string, comHora: boolean): Date | null {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return null;
  // No campo de data e hora, a hora é obrigatória: só a data gravaria
  // meia-noite sem a pessoa ter escolhido (P2 do Cassio na #171).
  const formatos = comHora ? FORMATOS_DE_DIA.flatMap((f) => [`${f} HH:mm`, `${f} HHmm`]) : FORMATOS_DE_DIA;
  for (const f of formatos) {
    const d = parse(limpo, f, new Date());
    // `parse` aceita "1/1/85" como ano 85; o ano tem de ter 4 dígitos e vir de 1900 em diante.
    if (isValid(d) && d.getFullYear() >= ANO_MINIMO) return d;
  }
  return null;
}

/** Só a data, sem a hora, num campo que pede as duas. */
export function soADataSemHora(texto: string): boolean {
  return lerDataDigitada(texto.trim().split(" ")[0] ?? "", false) !== null && lerDataDigitada(texto, true) === null;
}

export function DigitarData({
  comHora,
  dentroDoLimite,
  onData,
}: {
  comHora: boolean;
  dentroDoLimite: (d: Date) => boolean;
  onData: (d: Date) => void;
}) {
  const t = useT();
  const id = useId();
  const [texto, setTexto] = useState("");
  const data = lerDataDigitada(texto, comHora);
  const faltaHora = comHora && soADataSemHora(texto);
  const invalido = !faltaHora && texto.trim().length >= 8 && (!data || !dentroDoLimite(data));

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
      <label htmlFor={id} className="text-[12.5px] text-text-subtle">
        {t("Digite a data")}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder={comHora ? "dd/mm/aaaa hh:mm" : "dd/mm/aaaa"}
        value={texto}
        aria-invalid={invalido || undefined}
        aria-describedby={faltaHora || invalido ? `${id}-ajuda` : undefined}
        onChange={(e) => {
          setTexto(e.target.value);
          const d = lerDataDigitada(e.target.value, comHora);
          if (d && dentroDoLimite(d)) onData(d);
        }}
        className="h-8 min-w-0 flex-1 rounded-field border border-border bg-surface-elevated px-2 text-ui tabular-nums focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-hidden focus-visible:ring-3 focus-visible:ring-accent-soft aria-[invalid=true]:border-error"
      />
      {faltaHora && <span id={`${id}-ajuda`} className="w-full text-meta text-text-muted">{t("Digite também o horário (hh:mm).")}</span>}
      {invalido && (
        <span id={`${id}-ajuda`} className="w-full text-meta text-error-fg">
          {comHora ? t("Use dd/mm/aaaa hh:mm, de 1900 em diante.") : t("Use dd/mm/aaaa, de 1900 em diante.")}
        </span>
      )}
    </div>
  );
}
