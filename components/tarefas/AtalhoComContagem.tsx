"use client";

import type { ReactNode } from "react";

import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

/**
 * ATALHO COM CONTAGEM — o chip de um toque da barra ("Atrasadas 3", "Hoje 5").
 * É o `Chip` do design system com o número ao lado, no mesmo desenho dos
 * atalhos do Funil (`BarraDeBusca`). A contagem diz quantas o toque vai
 * mostrar com o resto dos filtros como está; sem `contagem`, o chip é só o
 * rótulo ("Minhas").
 *
 * `alerta`: número acima de zero ganha a cor de erro (só em "Atrasadas"), para
 * o atraso não depender de abrir o filtro para ser visto.
 */
export function AtalhoComContagem({
  ligado,
  onClick,
  icone,
  rotulo,
  contagem,
  alerta = false,
  disabled,
}: {
  ligado: boolean;
  onClick: () => void;
  icone: ReactNode;
  rotulo: string;
  contagem?: number;
  alerta?: boolean;
  disabled?: boolean;
}) {
  return (
    <Chip ligado={ligado} onClick={onClick} disabled={disabled} className="mb:h-11">
      {icone}
      {rotulo}
      {/* O espaço é para o leitor de tela: "Atrasadas 3", não "Atrasadas3". */}
      {contagem !== undefined && " "}
      {contagem !== undefined && (
        <span
          className={cn(
            "tabular-nums",
            alerta && contagem > 0 && !ligado ? "font-bold text-error-fg" : "opacity-70",
          )}
        >
          {contagem}
        </span>
      )}
    </Chip>
  );
}
