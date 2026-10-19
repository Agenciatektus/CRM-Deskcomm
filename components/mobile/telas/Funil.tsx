"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { formatMoney } from "@/components/inbox/painel/SemLista";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useBoard } from "@/hooks/kanban/useBoard";
import { AvatarDoLead } from "@/components/kanban/AvatarDoLead";
import { canalDoCard, iniciaisDoCard, nomeDoCard } from "@/lib/kanban/identidade-do-card";
import type { Lead } from "@/lib/types/leads";
import { ArrowRight, CaretDown, Check, Funnel } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { FolhaInferior } from "../FolhaInferior";
import { useFunisDoMenu } from "../FunisDoMenu";
import { FolhaMoverEtapaDoLead } from "./FolhaMoverEtapaDoLead";

/** "N leads abertos, R$ X": os abertos do funil e a soma do valor deles (na moeda do primeiro). */
export function resumoDoFunil(leads: Lead[]): { abertos: number; centavos: number; moeda: string | null } {
  const abertos = leads.filter((l) => l.status === "open");
  return {
    abertos: abertos.length,
    centavos: abertos.reduce((soma, l) => soma + (l.value_cents ?? 0), 0),
    moeda: abertos.find((l) => l.currency)?.currency ?? null,
  };
}

/**
 * O FUNIL NO CELULAR (o item 06 do protótipo), no lugar das colunas arrastáveis (que
 * brigam com a rolagem do dedo): seletor de funil no topo, resumo, abas de etapa com
 * contagem roláveis com o dedo e os cartões da etapa em LISTA, cada um com "Mover"
 * (a folha com as regras do quadro). Os dados são os do quadro (`useBoard`, a mesma
 * consulta e o mesmo realtime). O FAB "+" e a folha "Criar" vêm da casca.
 */
export function FunilNoCelular({
  pipelineId,
  aoTrocarFunil,
  leadsDoRecorte,
  barra,
  conteudo,
}: {
  pipelineId: string;
  aoTrocarFunil: (id: string) => void;
  /** Os leads já filtrados e ORDENADOS pela barra do Funil (a ordem vem pronta). */
  leadsDoRecorte?: Lead[];
  /** A barra do Funil (resumo, busca, atalhos), no lugar do resumo simples. */
  barra?: ReactNode;
  /** A Lista: no lugar das abas de etapa e dos cartões. */
  conteudo?: ReactNode;
}) {
  const t = useT();
  const funis = useFunisDoMenu();
  const { data, isLoading } = useBoard(pipelineId);
  const { data: membros } = useAssignableMembers(true);
  const [escolhendoFunil, setEscolhendoFunil] = useState(false);
  const [etapaEscolhida, setEtapaEscolhida] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<Lead | null>(null);

  const etapas = useMemo(() => (data?.stages ?? []).filter((s) => !s.is_archived), [data]);
  const etapaId = etapaEscolhida ?? etapas[0]?.id ?? null;
  const leads = leadsDoRecorte ?? data?.leads ?? [];
  const daEtapa = leads.filter((l) => l.stage_id === etapaId);
  if (!leadsDoRecorte) daEtapa.sort((a, b) => a.position_in_stage - b.position_in_stage);
  const nomes = new Map((membros ?? []).map((m) => [m.user_id, m.full_name]));
  const resumo = resumoDoFunil(leads);

  return (
    <div className="flex flex-col pb-4" data-testid="funil-no-celular">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setEscolhendoFunil(true)}
        className="pele-foco mx-4 flex min-h-(--mb-alvo) items-center gap-2 rounded-xl bg-surface px-3.5 text-left text-base font-bold text-text shadow-[0_0_0_1px_var(--color-border)]"
      >
        <Funnel size={18} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{data?.pipeline.name ?? t("Funil")}</span>
        <CaretDown size={18} aria-hidden />
      </button>
      {barra ?? (
        <p className="px-4 pt-2 text-[13.5px] text-text-muted">
          {resumo.abertos === 1 ? t("1 lead aberto") : `${resumo.abertos} ${t("leads abertos")}`}
          {resumo.centavos > 0 && `, ${formatMoney(resumo.centavos, resumo.moeda)}`}
        </p>
      )}
      {conteudo ?? (
      <>
      <div role="tablist" aria-label={t("Etapas do funil")} className="flex snap-x gap-1.5 overflow-x-auto scroll-px-4 px-4 py-3 scrollbar-none">
        {etapas.map((e) => {
          const ligada = e.id === etapaId;
          const n = leads.filter((l) => l.stage_id === e.id).length;
          return (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={ligada}
              onClick={() => setEtapaEscolhida(e.id)}
              className={cn(
                "flex min-h-(--mb-alvo) shrink-0 snap-start items-center gap-2 rounded-xl px-3.5 text-[14.5px] font-semibold",
                ligada ? "pele-grad-contador bg-accent text-accent-foreground" : "text-text-muted shadow-[inset_0_0_0_1px_var(--color-border-strong)]",
              )}
            >
              {e.name}
              <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-tint px-1.5 text-xs font-bold tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>
      {isLoading && <p className="px-4 py-8 text-center text-sm text-text-muted">{t("Carregando…")}</p>}
      {!isLoading && daEtapa.length === 0 && (
        <div className="px-8 py-10 text-center text-text-muted">
          <b className="mb-1.5 block text-[17px] text-text">{t("Nenhum lead nesta etapa")}</b>
          <p className="text-[14.5px]">{t("Leads chegam aqui quando avançam no funil ou quando você move um deles.")}</p>
        </div>
      )}
      <ul className="flex flex-col gap-2.5 px-4">
        {daEtapa.map((l) => (
          <li key={l.id} className="rounded-2xl bg-surface shadow-[0_0_0_1px_var(--color-border)]">
            <Link
              href={`/app/leads/${l.id}`}
              className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 rounded-t-2xl px-3.5 pt-3.5 pb-2 hover:bg-hover"
            >
              {/* O MESMO avatar e o MESMO nome do card do desktop (proposta de
                  13/10): foto ou iniciais com a cor da pessoa, selo do canal, e
                  nunca "Novo contato pelo WhatsApp". */}
              <AvatarDoLead
                semente={l.contact_id ?? l.id}
                iniciais={iniciaisDoCard(nomeDoCard(l).nome || t("Sem nome"))}
                foto={l.contact_tem_foto && l.contact_id ? `/api/v1/contacts/${l.contact_id}/avatar` : null}
                canal={canalDoCard(l)}
              />
              <span className="min-w-0">
                <b className="block truncate text-base text-text">{nomeDoCard(l).nome || t("Sem nome")}</b>
                {l.next_action?.label && (
                  <span className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-text-muted">
                    <ArrowRight size={14} aria-hidden />
                    <span className="truncate">{l.next_action.label}</span>
                  </span>
                )}
              </span>
              {l.value_cents ? <span className="text-[15px] font-bold whitespace-nowrap text-text">{formatMoney(l.value_cents, l.currency)}</span> : <span />}
            </Link>
            <div className="flex items-center gap-2 pr-1.5 pb-1.5 pl-3.5">
              <span className="flex-1 truncate text-[12.5px] text-text-subtle">
                {l.owner_user_id ? (nomes.get(l.owner_user_id) ?? t("Com alguém da equipe")) : t("Sem responsável")}
              </span>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`${t("Mover")} ${l.title}`}
                onClick={() => setMovendo(l)}
                className="pele-foco flex min-h-(--mb-alvo) items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold text-accent-text hover:bg-hover"
              >
                <ArrowRight size={16} aria-hidden />
                {t("Mover")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      </>
      )}
      <FolhaMoverEtapaDoLead lead={movendo} etapas={etapas} pipelineId={pipelineId} aoFechar={() => setMovendo(null)} />
      <FolhaInferior aberto={escolhendoFunil} aoMudar={setEscolhendoFunil} titulo={t("Funis")}>
        {funis.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-current={f.id === pipelineId ? "true" : undefined}
            onClick={() => {
              setEscolhendoFunil(false);
              setEtapaEscolhida(null);
              aoTrocarFunil(f.id);
            }}
            className="pele-foco flex min-h-(--mb-folha-item) w-full items-center gap-3 rounded-[14px] px-3 text-left text-base font-semibold text-text hover:bg-hover"
          >
            <Funnel size={20} className="text-accent-text" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {f.id === pipelineId && <Check size={18} className="text-accent-text" aria-hidden />}
          </button>
        ))}
      </FolhaInferior>
    </div>
  );
}
