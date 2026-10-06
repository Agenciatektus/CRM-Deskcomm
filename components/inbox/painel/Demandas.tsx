"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { CriarProximoPasso } from "./CriarProximoPasso";
import { SemLista } from "./SemLista";
import { useTarefasDoContato } from "./useTarefasDoContato";
import type { DemandaRow, DesfechoDraft } from "./tipos";

/** Vocabulário de quem atende, não o do banco. */
const ESTADO_LEGIVEL: Record<string, string> = {
  aberta: "Aberta",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando o cliente",
};

function horasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
}

function EncerrarDemanda({ draft, onAbrir, onAlterar, onFechar, onPronto }: {
  draft: DesfechoDraft | null;
  onAbrir: () => void;
  onAlterar: (patch: Partial<Pick<DesfechoDraft, "desfecho" | "salvando">>) => void;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const t = useT();
  if (!draft) return <Button size="sm" variant="ghost" onClick={onAbrir}>{t("Encerrar demanda")}</Button>;
  return <form className="mt-2 space-y-2" onSubmit={async (event) => {
    event.preventDefault(); onAlterar({ salvando: true });
    try {
      await apiClient.patch(`/api/v1/demandas/${draft.demandaId}`, { action: "encerrar", desfecho: draft.desfecho, expected_revision: draft.revision });
      toast.success(t("Desfecho registrado.")); onFechar(); onPronto();
    } catch { toast.error(t("Não foi possível encerrar. Cancele esta edição e abra novamente para revisar o desfecho.")); onPronto(); }
    finally { onAlterar({ salvando: false }); }
  }}>
    <label className="block">{t("Desfecho")}
      <select aria-label={t("Desfecho da demanda")} className="mt-1 w-full rounded-md border bg-background p-2" value={draft.desfecho} onChange={(e) => onAlterar({ desfecho: e.target.value })}>
        <option value="resolvida">{t("Resolvida")}</option><option value="convertida">{t("Convertida")}</option>
        <option value="nao_procede">{t("Não procede")}</option><option value="encerrada_pelo_cliente">{t("Encerrada pelo cliente")}</option>
        <option value="perdida">{t("Perdida")}</option><option value="expirada_sem_resposta">{t("Expirada sem resposta")}</option>
      </select>
    </label>
    <p>{t("Registra o resultado desta demanda. As conversas dos outros canais permanecem disponíveis.")}</p>
    <Button size="sm" disabled={draft.salvando} type="submit">{t("Confirmar desfecho")}</Button>
    <Button size="sm" variant="ghost" type="button" disabled={draft.salvando} onClick={onFechar}>{t("Cancelar")}</Button>
  </form>;
}

/**
 * "Marcar próximo passo" de uma demanda ABRE A CRIAÇÃO DA TAREFA, presa ao
 * contato e ao negócio aberto em foco (decisão do Peterson: próximo passo é
 * tarefa). Não grava mais o texto livre `demandas.proximo_passo`: duas verdades
 * sobre "o que fazer a seguir" fariam o Radar cobrar uma e a tela de Tarefas
 * mostrar outra.
 *
 * Fechado por padrão: a lista costuma ter mais de uma demanda, e um formulário
 * aberto em cada uma transformaria a seção em formulário.
 */
function MarcarProximoPasso({ contactId, leadId, usuarioId }: {
  contactId: string | null;
  leadId: string | null;
  usuarioId: string;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs" data-testid="marcar-proximo-passo" onClick={() => setAberto(true)}>
        {t("Marcar próximo passo")}
      </Button>
    );
  }
  return (
    <div className="mt-1.5" data-testid="proximo-passo-da-demanda">
      <CriarProximoPasso contactId={contactId} leadId={leadId} usuarioId={usuarioId} onCriado={() => setAberto(false)} />
      <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => setAberto(false)}>
        {t("Cancelar")}
      </Button>
    </div>
  );
}

interface Props {
  demandas: DemandaRow[] | null;
  carregando: boolean;
  erro: boolean;
  leitura: boolean;
  conversationId: string;
  currentDemandaId: string | null | undefined;
  contactId: string | null;
  desfechoDraft: DesfechoDraft | null;
  setDesfechoDraft: Dispatch<SetStateAction<DesfechoDraft | null>>;
  recarregar: () => void;
  usuarioId: string;
  leadEmFocoId: string | null;
}

/**
 * Demandas abertas. O rascunho do desfecho mora no PAI (`CRMSidePanel`), não
 * aqui: entre duas leituras a conversa vira `null` por um instante e esta peça
 * desmonta. Guardado aqui, o desfecho escolhido sumiria nessa lacuna.
 */
export function Demandas({
  demandas, carregando, erro, leitura, conversationId, currentDemandaId, contactId,
  desfechoDraft, setDesfechoDraft, recarregar, usuarioId, leadEmFocoId,
}: Props) {
  const t = useT();
  // A MESMA consulta do bloco Próximo passo (o react-query a divide): tarefa
  // aberta do contato É o próximo passo de qualquer demanda dele.
  const tarefas = useTarefasDoContato(contactId).lista.data ?? [];
  const temTarefaAberta = tarefas.length > 0;
  const doContexto = (d: DesfechoDraft | null, demandaId: string) =>
    d?.conversationId === conversationId && d.contactId === contactId && d.demandaId === demandaId;

  return (
    <section data-testid="inbox-demandas">
      <h3 className="text-xs font-semibold text-text">{t("Demandas abertas")}</h3>
      {carregando ? (
        <Skeleton className="mt-2 h-14 w-full" />
      ) : demandas && demandas.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {demandas.map((d) => {
            // O texto antigo da demanda conta como passo combinado (é histórico
            // real); daqui em diante, quem resolve o vazamento é a tarefa.
            const semPasso = !d.proximo_passo && !temTarefaAberta;
            return (
              <li
                key={d.id}
                data-testid={semPasso ? "demanda-sem-proximo-passo" : "demanda-com-proximo-passo"}
                className={cn("rounded-md border p-2 text-xs", semPasso ? "border-warning-border bg-warning-bg/40" : "border-border")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{t(ESTADO_LEGIVEL[d.estado] ?? d.estado)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t("há")} {horasDesde(d.aberta_em)}h
                  </span>
                </div>
                {/* O invariante 4 na frase, não só na cor. */}
                <div className={cn("mt-0.5", semPasso ? "font-medium" : "text-muted-foreground")}>
                  {d.proximo_passo
                    ? `${t("Combinado antes")}: ${d.proximo_passo}`
                    : temTarefaAberta ? t("Próximo passo nas tarefas do contato") : t("Sem próximo passo definido")}
                </div>
                {d.id === currentDemandaId && <Badge variant="outline">{t("Demanda vigente neste canal")}</Badge>}
                {!leitura && <EncerrarDemanda
                  draft={doContexto(desfechoDraft, d.id) ? desfechoDraft : null}
                  onAbrir={() => { if (contactId) setDesfechoDraft({ conversationId, contactId, demandaId: d.id, revision: d.revision, desfecho: "resolvida", salvando: false }); }}
                  onAlterar={(patch) => setDesfechoDraft((atual) => doContexto(atual, d.id) && atual ? { ...atual, ...patch } : atual)}
                  onFechar={() => setDesfechoDraft((atual) => doContexto(atual, d.id) ? null : atual)}
                  onPronto={recarregar}
                />}
                {semPasso && !leitura ? <MarcarProximoPasso contactId={contactId} leadId={leadEmFocoId} usuarioId={usuarioId} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <SemLista vazio={t("Nenhuma demanda aberta.")} erro={erro} onTentarDeNovo={recarregar} />
      )}
    </section>
  );
}
