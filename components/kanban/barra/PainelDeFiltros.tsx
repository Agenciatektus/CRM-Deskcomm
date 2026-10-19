"use client";

import { useMemo } from "react";

import { PontoDaEtiqueta } from "@/components/tags/PontoDaEtiqueta";
import { Chip } from "@/components/ui/chip";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useAssignableAgents } from "@/hooks/kanban/useAssignableAgents";
import { agentOwnerFilter, marcadoresDoFiltro, type LeadFilters } from "@/lib/kanban/filters";
import { marcadoresDoCard } from "@/lib/kanban/marcadores-do-card";
import { origemDoLead, PERIODOS, rotuloDaOrigem } from "@/lib/kanban/recorte-do-funil";
import { categoriaDoMotivo } from "@/lib/leads/motivos-de-perda-do-funil";
import { rotuloDoMotivoDePerda } from "@/lib/schemas/leads";
import type { Lead } from "@/lib/types/leads";

import { FaixaDeValor } from "./FaixaDeValor";
import { Grupo } from "./Grupo";

export const STATUS_DO_PAINEL: ReadonlyArray<{ id: NonNullable<LeadFilters["status"]>; rotulo: string }> = [
  { id: "open", rotulo: "Abertos" },
  { id: "won", rotulo: "Ganhos" },
  { id: "lost", rotulo: "Perdidos" },
  { id: "all", rotulo: "Todos" },
];

const alterna = (lista: readonly string[] | undefined, item: string): string[] | undefined => {
  const atual = lista ?? [];
  const proxima = atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item];
  return proxima.length > 0 ? proxima : undefined;
};

/**
 * O painel "Filtros" da barra do Funil — o MESMO conteúdo no popover do
 * desktop e na folha do celular. Cada toque aplica na hora (`onChange`): no
 * desktop o funil atrás responde ao vivo; no celular o "Ver N leads" fecha.
 *
 * As opções vêm do que ESTÁ no quadro (etiquetas pelas três caixas, motivos
 * de perda, origens), pela MESMA regra de quem filtra.
 */
export function PainelDeFiltros({
  filters,
  onChange,
  leads,
  settings,
  userId,
}: {
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  leads: Lead[];
  settings?: Record<string, unknown>;
  userId: string;
}) {
  const t = useT();
  const { data: members } = useAssignableMembers(true);
  const { data: agents } = useAssignableAgents(true);
  const set = (parcial: Partial<LeadFilters>) => onChange({ ...filters, ...parcial });

  const responsaveis = useMemo(
    () =>
      [
        ...(members ?? []).filter((m) => m.user_id !== userId).map((m) => ({ id: m.user_id, nome: m.full_name ?? t("Sem nome") })),
        ...(agents ?? []).map((a) => ({ id: agentOwnerFilter(a.agent_id), nome: a.name })),
      ].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")),
    [members, agents, userId, t],
  );
  const etiquetas = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) for (const m of marcadoresDoCard(l)) s.add(m);
    return [...s].sort();
  }, [leads]);
  const origens = useMemo(() => [...new Set(leads.map(origemDoLead))].sort(), [leads]);
  const porStatus = useMemo(() => {
    const c = { open: 0, won: 0, lost: 0, all: leads.length } as Record<string, number>;
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);
  const motivos = useMemo(
    () => [...new Set(leads.filter((l) => l.status === "lost" && l.lost_reason).map((l) => l.lost_reason as string))].sort(),
    [leads],
  );
  const categorias = useMemo(
    () => [...new Set(motivos.map((m) => categoriaDoMotivo(m, settings)).filter((c): c is string => !!c))].sort(),
    [motivos, settings],
  );
  const rotuloDoMotivo = (m: string) => {
    const r = rotuloDoMotivoDePerda(m);
    return r === m ? m : t(r);
  };
  const escolhidas = marcadoresDoFiltro(filters.tag);
  const dono = filters.owner && filters.owner !== "any" ? filters.owner : null;
  const ehDono = (id: string) => () => set({ owner: dono === id ? undefined : id });
  const status = filters.status ?? "open";

  return (
    <div className="grid gap-5 p-4 largo:grid-cols-2">
      <Grupo titulo={t("Responsável")}>
        <Chip ligado={dono === userId} onClick={ehDono(userId)}>{t("Eu")}</Chip>
        {responsaveis.map((r) => (
          <Chip key={r.id} ligado={dono === r.id} onClick={ehDono(r.id)}>{r.nome}</Chip>
        ))}
        <Chip ligado={dono === "unassigned"} onClick={ehDono("unassigned")}>{t("Sem responsável")}</Chip>
      </Grupo>

      <Grupo titulo={t("Status")} apoio={t("Padrão: Abertos")}>
        {STATUS_DO_PAINEL.map((s) => (
          <Chip
            key={s.id}
            ligado={status === s.id}
            onClick={() =>
              set({ status: s.id, ...(s.id !== "lost" ? { lostReason: undefined, lostCategory: undefined } : {}) })
            }
          >
            {t(s.rotulo)} <span className="tabular-nums opacity-70">{porStatus[s.id] ?? 0}</span>
          </Chip>
        ))}
      </Grupo>

      {status === "lost" && motivos.length > 0 && (
        <Grupo titulo={t("Motivo de perda")}>
          {motivos.map((m) => (
            <Chip key={m} ligado={filters.lostReason === m} onClick={() => set({ lostReason: filters.lostReason === m ? undefined : m })}>
              {rotuloDoMotivo(m)}
            </Chip>
          ))}
          {categorias.map((c) => (
            <Chip key={`c:${c}`} ligado={filters.lostCategory === c} onClick={() => set({ lostCategory: filters.lostCategory === c ? undefined : c })}>
              {t("Categoria")}: {c}
            </Chip>
          ))}
        </Grupo>
      )}

      {etiquetas.length > 0 && (
        <Grupo titulo={t("Etiquetas")}>
          {etiquetas.map((tag) => (
            <Chip
              key={tag}
              ligado={escolhidas.includes(tag)}
              onClick={() => {
                const tags = alterna(escolhidas, tag);
                set({ tag: tags, tagMode: tags && tags.length > 1 ? filters.tagMode : undefined });
              }}
            >
              <PontoDaEtiqueta tag={tag} />
              {tag}
            </Chip>
          ))}
          {escolhidas.length > 1 && (
            <Chip ligado={filters.tagMode === "ou"} onClick={() => set({ tagMode: filters.tagMode === "ou" ? undefined : "ou" })}>
              {t("Qualquer uma (OU)")}
            </Chip>
          )}
        </Grupo>
      )}

      <Grupo titulo={t("Canal de origem")}>
        {origens.map((o) => (
          <Chip key={o} ligado={!!filters.canais?.includes(o)} onClick={() => set({ canais: alterna(filters.canais, o) })}>
            {t(rotuloDaOrigem(o))}
          </Chip>
        ))}
      </Grupo>

      <FaixaDeValor min={filters.valueCentsMin} max={filters.valueCentsMax} onChange={(valueCentsMin, valueCentsMax) => set({ valueCentsMin, valueCentsMax })} />

      <Grupo titulo={t("Período de criação")}>
        {PERIODOS.map((p) => (
          <Chip key={p.id} ligado={filters.periodo === p.id} onClick={() => set({ periodo: filters.periodo === p.id ? undefined : p.id })}>
            {t(p.rotulo)}
          </Chip>
        ))}
      </Grupo>
    </div>
  );
}

