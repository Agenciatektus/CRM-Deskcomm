"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TarefasNoCelular } from "@/components/mobile/telas/Tarefas";
import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina/Pagina";
import { BarraDeFiltrosDasTarefas } from "@/components/tarefas/BarraDeFiltrosDasTarefas";
import { BarraEmLoteDeTarefas } from "@/components/tarefas/BarraEmLoteDeTarefas";
import { DossieDaTarefa } from "@/components/tarefas/DossieDaTarefa";
import { PainelDeFiltrosDasTarefas } from "@/components/tarefas/PainelDeFiltrosDasTarefas";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useLoteDeTarefas } from "@/hooks/tasks/useLoteDeTarefas";
import { useRecorteDasTarefas } from "@/hooks/tasks/useRecorteDasTarefas";
import { useTasks } from "@/hooks/tasks/useTasks";
import { useEhCelular } from "@/lib/mobile/useEhCelular";
import { usePedidoDeCriar } from "@/lib/mobile/usePedidoDeCriar";
import { prazoAdiado, type ModoDeAdiar } from "@/lib/tarefas/adiar";
import type { LoteDeTarefas } from "@/lib/tarefas/lote";
import { destinoAoAbrir, filtrosDaUrl, funisDasTarefas } from "@/lib/tarefas/recorte";
import { estaEncerrada, type NovaTarefa, type PrioridadeDaTarefa, type Tarefa } from "@/lib/tarefas/tipos";
import { CalendarBlank, ListChecks, Plus } from "@/lib/ui/icons";

import { CalendarioDeTarefas } from "./CalendarioDeTarefas";
import { FormularioDeTarefa } from "./FormularioDeTarefa";
import { ListaOrganizada } from "./ListaOrganizada";

/**
 * A lista relê sozinha a cada 30 s com a aba visível — no lugar do botão
 * "Atualizar", que saiu. `crm_tasks` não está na publicação do realtime; a
 * revalidação é a mesma de `useConversationCounts`.
 */
const REVALIDAR_MS = 30_000;
/** Quantos dias de encerradas a faixa "Encerradas" traz no recorte padrão. */
const DIAS_DE_ENCERRADAS = 7;

/** O relógio da tela: vira a cada minuto, para "Hoje" e "atrasada há" não envelhecerem. */
function useRelogio(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

function alterna(atual: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const proximo = new Set(atual);
  if (proximo.has(id)) proximo.delete(id);
  else proximo.add(id);
  return proximo;
}

export function TarefasClient({ podeEditar }: { podeEditar: boolean }) {
  const t = useT();
  const celular = useEhCelular();
  const usuario = useUser();
  const agora = useRelogio();
  const searchParams = useSearchParams();
  const [modo, setModo] = useState<"lista" | "calendario">("lista");
  const [emEdicao, setEmEdicao] = useState<Tarefa | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [prazoSugerido, setPrazoSugerido] = useState<string | undefined>();
  // A CHAVE DE REMONTAGEM do formulário: ele lê o estado inicial das props, e
  // abrir duas vezes seguidas o "Nova tarefa" precisa de uma chave NOVA.
  const [aberturas, setAberturas] = useState(0);
  const [selecao, setSelecao] = useState<ReadonlySet<string>>(new Set());
  const [dossie, setDossie] = useState<{ leadId: string; pipelineId: string } | null>(null);
  // Início do dia de 7 dias atrás, FIXO na montagem: a chave da consulta não
  // pode mudar a cada render.
  const [encerradasDesde] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - DIAS_DE_ENCERRADAS);
    return d.toISOString();
  });

  // A situação decide O QUE a rota traz; o resto do recorte é feito aqui.
  const situacao = filtrosDaUrl(new URLSearchParams(searchParams.toString())).situacao ?? "aberto";
  const { tarefas, carregando, falhou, recarregar, criarTarefa, editarTarefa, apagarTarefa, alternarConcluida } = useTasks(
    situacao === "aberto" ? { aberto: true, encerradasDesde } : { status: situacao },
    { revalidarMs: REVALIDAR_MS, enabled: !celular },
  );
  const { filtros, setFiltros, recorte, contagens } = useRecorteDasTarefas(tarefas, usuario.id, agora);
  const lote = useLoteDeTarefas();

  // Os nomes vêm da lista de responsáveis (`agent`+ na rota): para quem só lê,
  // a consulta nem sai e a linha fica sem o nome — nunca com um id cru.
  const membrosQ = useAssignableMembers(podeEditar);
  const membros = useMemo(() => (Array.isArray(membrosQ.data) ? membrosQ.data : []), [membrosQ.data]);
  const nomes = useMemo(() => new Map(membros.map((m) => [m.user_id, m.full_name])), [membros]);
  const nomeDe = useCallback((id: string) => nomes.get(id) ?? t("Responsável"), [nomes, t]);
  const nomeDoResponsavel = (tarefa: Tarefa): string | null => {
    if (!tarefa.assigned_to) return null;
    if (tarefa.assigned_to === usuario.id) return t("Eu");
    return nomes.get(tarefa.assigned_to) ?? null;
  };
  const funis = useMemo(() => funisDasTarefas(tarefas), [tarefas]);

  // A seleção vale só para o que está NA TELA: filtrar depois de marcar não
  // pode deixar uma tarefa escondida no lote.
  const visiveis = useMemo(() => new Set(recorte.map((x) => x.id)), [recorte]);
  const selecionadas = useMemo(() => new Set([...selecao].filter((id) => visiveis.has(id))), [selecao, visiveis]);
  const idsSelecionados = [...selecionadas];
  const limparSelecao = useCallback(() => setSelecao(new Set()), []);
  const fecharDossie = useCallback(() => setDossie(null), []);

  function abrirNova(dia?: string) {
    setEmEdicao(null);
    setPrazoSugerido(dia);
    setAberturas((n) => n + 1);
    setFormAberto(true);
  }
  // O "+" do celular chega com `?criar=1`.
  usePedidoDeCriar(() => abrirNova(), podeEditar);

  function abrirEdicao(tarefa: Tarefa) {
    setEmEdicao(tarefa);
    setPrazoSugerido(undefined);
    setAberturas((n) => n + 1);
    setFormAberto(true);
  }

  /** Tarefa de negócio abre o dossiê (detalhes + conversa) aqui mesmo; as outras, a edição. */
  function abrir(tarefa: Tarefa) {
    const destino = destinoAoAbrir(tarefa);
    if (destino.tipo === "dossie") setDossie({ leadId: destino.leadId, pipelineId: destino.pipelineId });
    else abrirEdicao(tarefa);
  }

  async function salvar(entrada: NovaTarefa) {
    if (emEdicao) await editarTarefa(emEdicao.id, entrada);
    else await criarTarefa(entrada);
  }

  /** Troca rápida da linha: a mesma rota da edição; a falha aparece, nunca some calada. */
  async function trocar(tarefa: Tarefa, entrada: Partial<NovaTarefa>, sucesso?: string) {
    try {
      await editarTarefa(tarefa.id, entrada);
      if (sucesso) toast.success(sucesso);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : t("Não foi possível salvar a tarefa."));
    }
  }

  const adiar = (tarefa: Tarefa, modoDeAdiar: ModoDeAdiar) =>
    trocar(tarefa, { due_date: prazoAdiado(modoDeAdiar, tarefa.due_date, new Date()).toISOString() }, t("Tarefa adiada."));

  // ── Lote ───────────────────────────────────────────────────────────────
  // A seleção sai NA HORA do agendamento (reconfirmar nos 5 s refaria a ação);
  // o Desfazer a devolve.
  const emLote = (mensagem: string, pedido: LoteDeTarefas, sucesso: (n: number) => string) => {
    const ids = idsSelecionados;
    if (lote.agendar(mensagem, pedido, sucesso, () => setSelecao(new Set(ids)))) limparSelecao();
  };
  const contadas = (um: string, varios: string) => (n: number) => `${n} ${n === 1 ? um : varios}`;

  const loteConcluir = () =>
    emLote(
      t("Concluindo as selecionadas"),
      { action: "complete", task_ids: idsSelecionados },
      contadas(t("tarefa concluída."), t("tarefas concluídas.")),
    );
  const loteAdiar = (modoDeAdiar: ModoDeAdiar) => {
    const porId = new Map(recorte.map((x) => [x.id, x]));
    const itens = idsSelecionados
      .map((id) => porId.get(id))
      .filter((x): x is Tarefa => !!x && !estaEncerrada(x))
      .map((x) => ({ id: x.id, due_date: prazoAdiado(modoDeAdiar, x.due_date, new Date()).toISOString() }));
    if (itens.length === 0) {
      toast.warning(t("As selecionadas já estão encerradas: não há o que adiar."));
      return;
    }
    emLote(t("Adiando as selecionadas"), { action: "postpone", itens }, contadas(t("tarefa adiada."), t("tarefas adiadas.")));
  };
  const loteReatribuir = (userId: string | null) =>
    emLote(
      t("Trocando o responsável das selecionadas"),
      { action: "assign", task_ids: idsSelecionados, assigned_to: userId },
      contadas(t("tarefa reatribuída."), t("tarefas reatribuídas.")),
    );
  const lotePrioridade = (p: PrioridadeDaTarefa) =>
    emLote(
      t("Mudando a prioridade das selecionadas"),
      { action: "priority", task_ids: idsSelecionados, priority: p },
      contadas(t("tarefa atualizada."), t("tarefas atualizadas.")),
    );
  const loteApagar = async () => {
    const apagou = await lote.apagar(idsSelecionados, contadas(t("tarefa apagada."), t("tarefas apagadas.")));
    if (apagou) limparSelecao();
    return apagou;
  };

  const formulario = (
    <FormularioDeTarefa
      key={aberturas}
      aberto={formAberto}
      aoMudarAbertura={setFormAberto}
      tarefa={emEdicao}
      prazoSugerido={prazoSugerido}
      aoSalvar={salvar}
    />
  );

  // Celular (M3.2): a aba Tarefas do protótipo, com o mesmo formulário.
  if (celular) {
    return (
      <>
        <TarefasNoCelular podeEditar={podeEditar} aoAbrirTarefa={abrirEdicao} />
        {formulario}
      </>
    );
  }

  const painel = (
    <PainelDeFiltrosDasTarefas filtros={filtros} onChange={setFiltros} membros={membros} usuarioId={usuario.id} funis={funis} />
  );

  return (
    <Pagina testId="tela-de-tarefas">
      <CabecalhoDaPagina
        titulo={t("Tarefas")}
        descricao={t("O que ficou combinado, com prazo. Tarefa presa a um negócio aparece na linha do tempo dele.")}
        acoes={
          <>
            <Tabs value={modo} onValueChange={(v) => setModo(v === "calendario" ? "calendario" : "lista")}>
              <TabsList aria-label={t("Modo de ver as tarefas")}>
                <TabsTrigger value="lista" className="gap-1.5">
                  <ListChecks size={14} aria-hidden />
                  {t("Lista")}
                </TabsTrigger>
                <TabsTrigger value="calendario" className="gap-1.5">
                  <CalendarBlank size={14} aria-hidden />
                  {t("Calendário")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {podeEditar && (
              <Button size="sm" className="gap-1.5" onClick={() => abrirNova()}>
                <Plus size={14} aria-hidden />
                {t("Nova tarefa")}
              </Button>
            )}
          </>
        }
      />

      <SecaoDaPagina>
        <BarraDeFiltrosDasTarefas
          filtros={filtros}
          onChange={setFiltros}
          contagens={contagens}
          totalDoRecorte={recorte.length}
          celular={false}
          painel={painel}
          nomeDe={nomeDe}
          funis={funis}
        />
      </SecaoDaPagina>

      <SecaoDaPagina>
        {falhou ? (
          <div className="rounded-xl border border-border bg-error-bg p-6 text-center">
            <p className="text-sm font-medium text-error-fg">{t("Não foi possível carregar as tarefas.")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => recarregar()}>
              {t("Tentar novamente")}
            </Button>
          </div>
        ) : carregando ? (
          <div className="space-y-3" aria-busy>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-surface" />
            ))}
          </div>
        ) : modo === "calendario" ? (
          <CalendarioDeTarefas tarefas={recorte} podeEditar={podeEditar} aoAbrirTarefa={abrir} aoClicarNoDia={abrirNova} />
        ) : (
          <ListaOrganizada
            tarefas={recorte}
            semNenhuma={tarefas.length === 0}
            ordem={filtros.ordem ?? "prazo"}
            agrupar={filtros.agrupar ?? "prazo"}
            agora={agora}
            usuarioId={usuario.id}
            selecionadas={selecionadas}
            aoSelecionar={podeEditar ? (x) => setSelecao((s) => alterna(s, x.id)) : undefined}
            aoSelecionarGrupo={(ids, marcar) =>
              setSelecao((s) => {
                const proximo = new Set(s);
                for (const id of ids) {
                  if (marcar) proximo.add(id);
                  else proximo.delete(id);
                }
                return proximo;
              })
            }
            nomeDoResponsavel={nomeDoResponsavel}
            nomeDe={nomeDe}
            podeEditar={podeEditar}
            mostrarVinculo
            membros={membros}
            aoAbrir={abrir}
            aoAlternarConcluida={alternarConcluida}
            aoEditar={abrirEdicao}
            aoApagar={(tarefa) => apagarTarefa(tarefa.id)}
            aoAdiar={adiar}
            aoReatribuir={(tarefa, id) => trocar(tarefa, { assigned_to: id })}
            aoMudarPrioridade={(tarefa, p) => trocar(tarefa, { priority: p })}
          />
        )}
      </SecaoDaPagina>

      {modo === "lista" && (
        <BarraEmLoteDeTarefas
          quantidade={selecionadas.size}
          ocupado={lote.ocupado}
          membros={membros}
          usuarioId={usuario.id}
          podeEditar={podeEditar}
          onConcluir={loteConcluir}
          onAdiar={loteAdiar}
          onReatribuir={loteReatribuir}
          onPrioridade={lotePrioridade}
          onApagar={loteApagar}
          onLimpar={limparSelecao}
        />
      )}

      {dossie && (
        <DossieDaTarefa
          key={dossie.leadId}
          leadId={dossie.leadId}
          pipelineId={dossie.pipelineId}
          ownerNames={nomes}
          onFechar={fecharDossie}
        />
      )}

      {formulario}
    </Pagina>
  );
}
