"use client";

import type { ComponentType } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";
import type { VistaDoFunil } from "@/hooks/kanban/usePreferenciasDoFunil";
import { CalendarBlank, Kanban, ListBullets, ListDashes, Rows } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Icone = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

/**
 * Segmentado SÓ COM ÍCONE (barra do Funil, 13/10/2026): `<button>` nativo com
 * `aria-pressed` e `aria-label`; o nome aparece no tooltip no hover E no foco
 * do teclado (Radix). Escolha entre estados, sem componente de abas.
 */
function Segmentado<T extends string | boolean>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: ReadonlyArray<{ id: T; rotulo: string; Icone: Icone }>;
  onChange: (v: T) => void;
}) {
  const t = useT();
  return (
    <TooltipProvider delayDuration={300}>
      <div role="group" aria-label={rotulo} className="flex rounded-md border border-border p-0.5">
        {opcoes.map((o) => (
          <Tooltip key={String(o.id)}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={valor === o.id}
                aria-label={t(o.rotulo)}
                onClick={() => onChange(o.id)}
                className={cn(
                  "grid size-8 place-items-center rounded-sm transition-colors mb:size-11",
                  valor === o.id ? "bg-muted text-text" : "text-text-muted hover:text-text",
                )}
              >
                <o.Icone size={16} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t(o.rotulo)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

const DENSIDADES = [
  { id: false, rotulo: "Confortável", Icone: Rows },
  { id: true, rotulo: "Compacto", Icone: ListDashes },
] as const;

/** Confortável × compacto, no cabeçalho do Funil. */
export function SeletorDeDensidade({
  compacto,
  onChange,
}: {
  compacto: boolean;
  onChange: (compacto: boolean) => void;
}) {
  const t = useT();
  return <Segmentado<boolean> rotulo={t("Densidade dos cards")} valor={compacto} opcoes={DENSIDADES} onChange={onChange} />;
}

const VISTAS = [
  { id: "kanban", rotulo: "Kanban", Icone: Kanban },
  { id: "lista", rotulo: "Lista", Icone: ListBullets },
  { id: "calendario", rotulo: "Calendário", Icone: CalendarBlank },
] as const;

/** Kanban × Lista × Calendário. */
export function SeletorDeVista({ vista, onChange }: { vista: VistaDoFunil; onChange: (v: VistaDoFunil) => void }) {
  const t = useT();
  return <Segmentado<VistaDoFunil> rotulo={t("Modo de ver o funil")} valor={vista} opcoes={VISTAS} onChange={onChange} />;
}
