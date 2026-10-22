/**
 * Os rótulos da tela de Tarefas, sempre por `t()` com o texto LITERAL (a cerca
 * de espanhol lê as chamadas, e chave montada em tempo de execução escaparia).
 * Uma função por vocabulário, para a linha, a barra, o painel e a vitrine do
 * design system dizerem a MESMA palavra.
 */
import type { BadgeProps } from "@/components/ui/badge";
import type { ModoDeAdiar } from "@/lib/tarefas/adiar";
import type { Agrupamento, OrdemDasTarefas, PeriodoDoPrazo, SituacaoDoFiltro, Vinculo } from "@/lib/tarefas/recorte";
import type { FaixaDePrazo, PrioridadeDaTarefa } from "@/lib/tarefas/tipos";

type T = (texto: string) => string;

export const rotulosDaPrioridade = (t: T): Record<PrioridadeDaTarefa, string> => ({
  low: t("Baixa"),
  medium: t("Média"),
  high: t("Alta"),
  urgent: t("Urgente"),
});

/** A cor é a PÍLULA de estado do design system (tokens), nunca um hex. */
export const TOM_DA_PRIORIDADE: Record<PrioridadeDaTarefa, NonNullable<BadgeProps["variant"]>> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "error",
};

export const rotulosDaFaixa = (t: T): Record<FaixaDePrazo, string> => ({
  atrasada: t("Atrasadas"),
  hoje: t("Hoje"),
  esta_semana: t("Esta semana"),
  mais_tarde: t("Mais tarde"),
  sem_prazo: t("Sem prazo"),
  encerrada: t("Encerradas"),
});

export const rotulosDoAdiar = (t: T): Record<ModoDeAdiar, string> => ({
  uma_hora: t("+1 hora"),
  amanha: t("Amanhã"),
  proxima_semana: t("Próxima semana"),
});

export const rotulosDaSituacao = (t: T): Record<SituacaoDoFiltro, string> => ({
  aberto: t("Em aberto"),
  pending: t("Pendente"),
  in_progress: t("Em andamento"),
  done: t("Concluída"),
  cancelled: t("Cancelada"),
});

export const rotulosDoPeriodo = (t: T): Record<PeriodoDoPrazo, string> => ({
  vencidas: t("Vencidas"),
  hoje: t("Hoje"),
  amanha: t("Amanhã"),
  proximos_7: t("Próximos 7 dias"),
  sem_prazo: t("Sem prazo"),
});

export const rotulosDoVinculo = (t: T): Record<Vinculo, string> => ({
  negocio: t("De negócio"),
  contato: t("Só de contato"),
  avulsa: t("Avulsa"),
});

export const rotulosDaOrdem = (t: T): Record<OrdemDasTarefas, string> => ({
  prazo: t("Prazo"),
  prioridade: t("Prioridade"),
  criacao: t("Mais recentes"),
});

export const rotulosDoAgrupamento = (t: T): Record<Agrupamento, string> => ({
  prazo: t("Por prazo"),
  responsavel: t("Por responsável"),
});
