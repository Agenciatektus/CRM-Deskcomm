"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import type { AgentStatus } from "./AgentStatusBadge";

export type StatusFilter = AgentStatus | "all";

interface Props {
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
}

/** Os filtros da lista de agentes (a busca é da `BarraDeFiltros`). */
export function AgentsListFilters({
  status,
  onStatusChange,
  showArchived,
  onShowArchivedChange,
}: Props) {
  const t = useT();
  return (
    <>
      <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <SelectTrigger className="w-44" aria-label={t("Filtrar por status")}>
          <SelectValue placeholder={t("Status")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("Todos")}</SelectItem>
          <SelectItem value="published">{t("Publicado")}</SelectItem>
          <SelectItem value="paused">{t("Pausado")}</SelectItem>
          <SelectItem value="archived">{t("Arquivado")}</SelectItem>
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => onShowArchivedChange(e.target.checked)}
          className="size-4"
        />
        {t("Incluir arquivados")}
      </label>
    </>
  );
}
