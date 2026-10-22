"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { MODOS_DE_ADIAR, prazoAdiado, type ModoDeAdiar } from "@/lib/tarefas/adiar";
import { Alarm, CaretDown } from "@/lib/ui/icons";

import { rotulosDoAdiar } from "./rotulos";

/**
 * ADIAR RÁPIDO — +1 hora, amanhã, próxima semana, num toque.
 *
 * Cada opção mostra PARA QUANDO vai ("Amanhã · qui., 15:00"), calculado com a
 * mesma função que grava (`prazoAdiado`): o que se lê é o que se salva. Na
 * linha (`compacto`) o gatilho é só o ícone; na barra em lote leva o rótulo.
 * Sem `prazoAtual` (o lote, com prazos diferentes), a prévia some e fica só o
 * nome da opção.
 */
export function AdiarRapido({
  prazoAtual,
  onEscolher,
  disabled,
  compacto = false,
  agora,
}: {
  /** `undefined` = vários prazos (o lote): sem prévia de horário. */
  prazoAtual?: string | null;
  onEscolher: (modo: ModoDeAdiar) => void;
  disabled?: boolean;
  compacto?: boolean;
  /** Fixa o relógio (vitrine, teste). */
  agora?: Date;
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  const rotulos = rotulosDoAdiar(t);
  const formato = new Intl.DateTimeFormat(tag, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compacto ? (
          <Button variant="icon" size="icon" className="lg:h-7 lg:w-7" aria-label={t("Adiar a tarefa")} disabled={disabled}>
            <Alarm aria-hidden />
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={disabled} className="gap-1.5">
            <Alarm aria-hidden />
            {t("Adiar…")}
            <CaretDown size={12} aria-hidden />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" folhaNoCelular>
        <DropdownMenuLabel>{t("Adiar para")}</DropdownMenuLabel>
        {MODOS_DE_ADIAR.map((modo) => (
          <DropdownMenuItem key={modo} onClick={() => onEscolher(modo)} className="justify-between gap-4">
            <span>{rotulos[modo]}</span>
            {prazoAtual !== undefined && (
              <span className="text-meta text-text-subtle tabular-nums">
                {formato.format(prazoAdiado(modo, prazoAtual, agora ?? new Date()))}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
