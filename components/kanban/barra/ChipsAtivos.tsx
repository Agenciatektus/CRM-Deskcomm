"use client";

import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useAssignableAgents } from "@/hooks/kanban/useAssignableAgents";
import { marcadoresDoFiltro, parseAgentOwnerFilter, type LeadFilters } from "@/lib/kanban/filters";
import { PERIODOS, rotuloDaOrigem } from "@/lib/kanban/recorte-do-funil";
import { formatValorDoNegocio, MOEDA_PADRAO } from "@/lib/money";
import { rotuloDoMotivoDePerda } from "@/lib/schemas/leads";
import { X } from "@/lib/ui/icons";

import { STATUS_DO_PAINEL } from "./PainelDeFiltros";

/**
 * Um chip de filtro ligado. `R` é o que o "x" desfaz: os filtros do Funil por
 * padrão; a tela de Tarefas usa a mesma faixa com os filtros dela.
 */
export interface ChipAtivo<R = Partial<LeadFilters>> {
  chave: string;
  rotulo: string;
  remover: R;
}

const reais = (c: number) => formatValorDoNegocio(c, MOEDA_PADRAO, { semCentavos: true });

/**
 * Os filtros DO PAINEL que estão ligados, um chip por grupo (os atalhos já
 * mostram o estado no próprio botão). A contagem do botão "Filtros (N)" é o
 * tamanho desta lista: o número e os chips nunca discordam.
 */
export function chipsDosFiltros(
  f: LeadFilters,
  t: (s: string) => string,
  nomeDoDono: (owner: string) => string,
): ChipAtivo[] {
  const chips: ChipAtivo[] = [];
  if (f.owner && f.owner !== "any") chips.push({ chave: "owner", rotulo: `${t("Responsável")}: ${nomeDoDono(f.owner)}`, remover: { owner: undefined } });
  if (f.status && f.status !== "open") {
    const s = STATUS_DO_PAINEL.find((x) => x.id === f.status);
    chips.push({ chave: "status", rotulo: `${t("Status")}: ${t(s?.rotulo ?? "Todos")}`, remover: { status: "open", lostReason: undefined, lostCategory: undefined } });
  }
  if (f.lostReason) {
    const r = rotuloDoMotivoDePerda(f.lostReason);
    chips.push({ chave: "motivo", rotulo: `${t("Motivo")}: ${r === f.lostReason ? r : t(r)}`, remover: { lostReason: undefined } });
  }
  if (f.lostCategory) chips.push({ chave: "categoria", rotulo: `${t("Categoria")}: ${f.lostCategory}`, remover: { lostCategory: undefined } });
  const tags = marcadoresDoFiltro(f.tag);
  if (tags.length > 0) chips.push({ chave: "tag", rotulo: `${t("Etiquetas")}: ${tags.join(f.tagMode === "ou" ? ` ${t("ou")} ` : ", ")}`, remover: { tag: undefined, tagMode: undefined } });
  if (f.canais?.length) chips.push({ chave: "canal", rotulo: `${t("Canal")}: ${f.canais.map((c) => t(rotuloDaOrigem(c))).join(", ")}`, remover: { canais: undefined } });
  const min = typeof f.valueCentsMin === "number" ? f.valueCentsMin : null;
  const max = typeof f.valueCentsMax === "number" ? f.valueCentsMax : null;
  if (min !== null || max !== null) {
    const rotulo =
      max === 0 ? t("Sem valor") : min !== null && max !== null ? `${reais(min)} – ${reais(max)}` : min !== null ? `${t("A partir de")} ${reais(min)}` : `${t("Até")} ${reais(max ?? 0)}`;
    chips.push({ chave: "valor", rotulo: `${t("Valor")}: ${rotulo}`, remover: { valueCentsMin: undefined, valueCentsMax: undefined } });
  }
  if (f.periodo) {
    const p = PERIODOS.find((x) => x.id === f.periodo);
    chips.push({ chave: "periodo", rotulo: `${t("Criados")}: ${t(p?.rotulo ?? "")}`, remover: { periodo: undefined } });
  }
  return chips;
}

/** O nome do dono escolhido, pela mesma lista do painel. */
export function useNomeDoDono(userId: string): (owner: string) => string {
  const t = useT();
  const { data: members } = useAssignableMembers(true);
  const { data: agents } = useAssignableAgents(true);
  return (owner) => {
    if (owner === "unassigned") return t("Sem responsável");
    if (owner === userId) return t("Eu");
    const agente = parseAgentOwnerFilter(owner);
    if (agente) return agents?.find((a) => a.agent_id === agente)?.name ?? t("Agente");
    return members?.find((m) => m.user_id === owner)?.full_name ?? t("Responsável");
  };
}

/** A faixa de chips removíveis + "Limpar tudo". */
export function ChipsAtivos<R = Partial<LeadFilters>>({
  chips,
  onRemover,
  onLimpar,
}: {
  chips: ChipAtivo<R>[];
  onRemover: (c: ChipAtivo<R>) => void;
  onLimpar: () => void;
}) {
  const t = useT();
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("Filtros ativos")} role="group">
      {chips.map((c) => (
        <span key={c.chave} className="inline-flex h-7.5 items-center gap-1 rounded-full border border-accent bg-accent/10 pr-1 pl-2.75 text-label font-semibold text-text">
          {c.rotulo}
          <button
            type="button"
            aria-label={`${t("Remover filtro")} ${c.rotulo}`}
            onClick={() => onRemover(c)}
            className="grid size-6 place-items-center rounded-full hover:bg-hover mb:size-9"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" onClick={onLimpar} className="px-2 text-label font-semibold text-accent-text hover:underline mb:min-h-11">
        {t("Limpar tudo")}
      </button>
    </div>
  );
}
