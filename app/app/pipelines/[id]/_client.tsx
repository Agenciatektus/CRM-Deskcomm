"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { usePedidoDeCriar } from "@/lib/mobile/usePedidoDeCriar";
import { FunilNoCelular } from "@/components/mobile/telas/Funil";
import { useEhCelular } from "@/lib/mobile/useEhCelular";
import { usePodeCriar } from "@/lib/mobile/usePodeCriar";
import { useT } from "@/hooks/i18n/useT";
import { useBoard } from "@/hooks/kanban/useBoard";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { CabecalhoDoFunil } from "@/components/kanban/barra/CabecalhoDoFunil";
import { BarraDeBusca } from "@/components/kanban/barra/BarraDeBusca";
import { PainelDeFiltros } from "@/components/kanban/barra/PainelDeFiltros";
import { ListaDoFunil } from "@/components/kanban/ListaDoFunil";
import { ListaDoFunilCelular } from "@/components/kanban/ListaDoFunilCelular";
import { useFunilCompacto } from "@/hooks/kanban/useFunilCompacto";
import { useOrdemDoFunil, useVistaDoFunil } from "@/hooks/kanban/usePreferenciasDoFunil";
import { useRecorteDoFunil } from "@/hooks/kanban/useRecorteDoFunil";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { NewLeadDialog } from "@/components/kanban/NewLeadDialog";
import { ROLE_RANK, type Role } from "@/lib/auth/types";

function formatError(err: unknown, t: (texto: string) => string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const obj = err as { message?: unknown; code?: unknown };
    if (typeof obj.message === "string") {
      const code = typeof obj.code === "string" ? ` [${obj.code}]` : "";
      return `${obj.message}${code}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return t("Erro desconhecido");
    }
  }
  return String(err);
}

/**
 * A página do Funil com a barra aprovada pelo Peterson (board "Barra do
 * Funil", 13/10/2026): resumo do recorte no título, Kanban × Lista e
 * densidade só com ícone, busca por gente, atalhos, painel de filtros e
 * Ordenar. Filtros na URL (e lembrados por pessoa); vista, ordem e densidade
 * por pessoa neste navegador.
 *
 * Cadências saiu da barra (não é um modo de ver o funil): `?modo=cadencias`
 * cai no Kanban. A tela de cadências do funil segue no código.
 */
export function PipelinePageClient({
  pipelineId,
  initialName,
  role,
}: {
  pipelineId: string;
  initialName: string;
  role: Role;
}) {
  const t = useT();
  const { data, isLoading, error, pulses, realtimeStatus, seguranca } = useBoard(pipelineId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const celular = useEhCelular();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [compacto, setCompacto] = useFunilCompacto(user?.id);
  const [vista, setVista] = useVistaDoFunil(user?.id);
  const [ordem, setOrdem] = useOrdemDoFunil(user?.id);
  const { filters, setFilters, recorte, ordenados, resumo, contagens } = useRecorteDoFunil(pipelineId, data, user?.id, ordem);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  // O "+" do celular chega com `?criar=1`.
  const podeCriar = usePodeCriar();
  usePedidoDeCriar(() => setNewOpen(true), podeCriar);
  const { data: membros } = useAssignableMembers(true);
  const ownerNames = useMemo(() => new Map((membros ?? []).map((m) => [m.user_id, m.full_name])), [membros]);

  // A lista da tag em lote é só `lead.tags` (é lá que a ação em lote grava, #852),
  // não as três caixas do painel de filtros.
  const tagsDoQuadro = useMemo(
    () => [...new Set((data?.leads ?? []).flatMap((l) => l.tags))].sort(),
    [data?.leads],
  );

  const cabecalho = (
    <CabecalhoDoFunil
      titulo={data?.pipeline.name ?? initialName}
      resumo={resumo}
      atrasadosLigado={!!filters.overdueOnly}
      onAtrasados={() => setFilters({ ...filters, overdueOnly: filters.overdueOnly ? undefined : true })}
      vista={vista}
      onVista={setVista}
      compacto={compacto}
      onCompacto={setCompacto}
      onNovo={() => setNewOpen(true)}
      carregado={!!data}
      celular={celular}
    />
  );
  const barra = (
    <BarraDeBusca
      filters={filters}
      onChange={setFilters}
      contagens={contagens}
      totalDoRecorte={recorte.length}
      ordem={ordem}
      onOrdem={setOrdem}
      userId={userId}
      celular={celular}
      painel={
        <PainelDeFiltros
          filters={filters}
          onChange={setFilters}
          leads={data?.leads ?? []}
          settings={data?.pipeline.settings}
          userId={userId}
        />
      }
    />
  );
  const lote = (
    <BulkActionBar
      selectedIds={selectedIds}
      stages={data?.stages ?? []}
      pipelineId={pipelineId}
      vocabulary={data?.pipeline.vocabulary ?? null}
      tagsExistentes={tagsDoQuadro}
      onClear={() => setSelectedIds([])}
    />
  );
  // #1751 (upstream): o quadro é a lista que o diálogo confere ANTES de criar —
  // é ela que faz o aviso de negócio duplicado existir sem rede.
  const novo = data && (
    <NewLeadDialog
      open={newOpen}
      onOpenChange={setNewOpen}
      pipelineId={pipelineId}
      stages={data.stages}
      leads={data.leads}
    />
  );
  const lista = (Lista: typeof ListaDoFunil) =>
    data && (
      <Lista
        leads={ordenados}
        stages={data.stages}
        ownerNames={ownerNames}
        ordem={ordem}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
    );

  // Celular (M3.1): abas de etapa e cartões (as colunas arrastáveis brigam com o
  // dedo), com a MESMA barra empilhada em cima; a Lista vira cards com toque longo.
  if (celular) {
    return (
      <>
        <FunilNoCelular
          pipelineId={pipelineId}
          aoTrocarFunil={(id) => router.push(`/app/pipelines/${id}`)}
          leadsDoRecorte={data ? ordenados : undefined}
          barra={<div className="flex flex-col gap-2 px-4 pt-2">{cabecalho}{barra}</div>}
          conteudo={vista === "lista" ? lista(ListaDoFunilCelular) : undefined}
        />
        {vista === "lista" && lote}
        {novo}
      </>
    );
  }

  return (
    <div
      // O QUADRO CABE NA TELA: altura da área visível (100dvh menos a barra do
      // topo, h-14, e o p-6 do <main>); quem rola é o quadro, com a barra
      // horizontal no pé e o cabeçalho de cada etapa preso em cima.
      className="flex h-[calc(100dvh-3.5rem-3rem)] min-h-[28rem] flex-col gap-3"
      // OBSERVÁVEIS de propósito: "a assinatura morreu" e "nada aconteceu"
      // produzem o mesmo silêncio na tela; estes valores separam as duas causas.
      data-realtime-status={realtimeStatus.toLowerCase()}
      data-refetch-divergencias={seguranca.divergencias}
      data-refetch-em={seguranca.ultimaVerificacao ?? ""}
    >
      {cabecalho}
      {novo}
      {barra}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {t("Não consegui carregar este funil:")} {formatError(error, t)}
        </div>
      ) : isLoading || !data ? (
        <div className="flex flex-1 animate-pulse items-center justify-center text-muted-foreground">
          {t("Carregando…")}
        </div>
      ) : vista === "lista" ? (
        lista(ListaDoFunil)
      ) : (
        <KanbanBoard
          pipelineId={pipelineId}
          stages={data.stages}
          leads={recorte}
          pulses={pulses}
          pipeline={data.pipeline}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          leadInicial={searchParams.get("lead")}
          podeRenomearEtapa={ROLE_RANK[role] >= ROLE_RANK.manager}
          compacto={compacto}
          ordenar={ordem}
        />
      )}
      {lote}
    </div>
  );
}
