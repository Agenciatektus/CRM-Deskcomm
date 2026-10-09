"use client";

import { CaretDown } from "@/lib/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import type { InboxTab } from "../InboxFilters";

export interface AbaComContagem {
  value: InboxTab;
  /** Rótulo em português: a tradução acontece aqui, no ponto de render. */
  label: string;
  count?: number;
}

interface Props {
  tab: InboxTab;
  /** As que ficam à vista no controle segmentado (Fila, Minhas, Todas). */
  principais: AbaComContagem[];
  /** As que vão para o "Mais" (Fechadas, Arquivadas, Automático…). */
  escondidas: AbaComContagem[];
  onChange: (tab: InboxTab) => void;
}

/** Badge de contagem: zero não aparece, em nenhuma aba (ver o e2e de "Fechadas"). */
function Contagem({ count, ativa }: { count?: number; ativa: boolean }) {
  if (typeof count !== "number" || count <= 0) return null;
  return (
    <span
      className={cn(
        "text-[11px] tabular-nums",
        ativa ? "font-bold text-accent" : "font-medium text-text-subtle",
      )}
    >
      {count}
    </span>
  );
}

/**
 * As visões da Inbox: três à vista e o resto no "Mais" (visual v2).
 *
 * Eram seis abas numa faixa que rolava na horizontal, com setas para alcançar as
 * de fora. As três do dia inteiro (Fila, Minhas, Todas) ficam num controle
 * segmentado, com contagem; as outras vão para um menu. Quando a aba ativa é uma
 * das escondidas, o botão passa a mostrar o NOME dela: sem isso o operador
 * estaria numa aba que nenhum controle da tela marca como ativa.
 *
 * As três principais continuam `role="tab"` (Radix `Tabs`, setas do teclado
 * entre elas). As escondidas são `menuitemradio`, que marca a ativa com
 * `aria-checked`.
 */
export function AbasDaInbox({ tab, principais, escondidas, onChange }: Props) {
  const t = useT();
  const escondidaAtiva = escondidas.find((a) => a.value === tab);
  return (
    <Tabs value={tab} onValueChange={(v) => onChange(v as InboxTab)}>
      <div className="pele-seg flex gap-0.5 rounded-lg border border-border bg-surface-elevated p-[3px]">
        <TabsList className="h-auto min-w-0 flex-1 gap-0.5 rounded-none bg-transparent p-0">
          {principais.map((aba) => (
            <TabsTrigger
              key={aba.value}
              value={aba.value}
              className={cn(
                "h-7 min-w-0 flex-1 gap-1.5 rounded-md px-2 text-xs font-semibold text-text-muted shadow-none",
                "pele-seg-item hover:text-text data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm",
              )}
            >
              {t(aba.label)}
              <Contagem count={aba.count} ativa={aba.value === tab} />
            </TabsTrigger>
          ))}
        </TabsList>
        {escondidas.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-ativa={escondidaAtiva ? "true" : undefined}
                className={cn(
                  "pele-seg-item flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-text-muted hover:text-text",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  escondidaAtiva && "bg-surface text-text shadow-sm",
                )}
              >
                {escondidaAtiva ? t(escondidaAtiva.label) : t("Mais")}
                {escondidaAtiva && <Contagem count={escondidaAtiva.count} ativa />}
                <CaretDown size={12} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuRadioGroup value={tab} onValueChange={(v) => onChange(v as InboxTab)}>
                {escondidas.map((aba) => (
                  <DropdownMenuRadioItem key={aba.value} value={aba.value} className="gap-2">
                    <span className="flex-1">{t(aba.label)}</span>
                    {typeof aba.count === "number" && aba.count > 0 && (
                      <span className="text-xs tabular-nums text-text-subtle">{aba.count}</span>
                    )}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Tabs>
  );
}
