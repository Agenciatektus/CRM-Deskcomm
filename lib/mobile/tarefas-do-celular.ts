import { diaLocalDoPrazo, estaAtrasada, faixaDePrazo, type Tarefa } from "@/lib/tarefas/tipos";

/** As seções da Lista do celular (o protótipo): Atrasadas, Hoje e Próximas, nesta ordem. */
export type SecaoDaLista = "atrasadas" | "hoje" | "proximas";

/**
 * Separa as tarefas ABERTAS nas três seções do celular. "Próximas" junta o que o
 * desktop divide em esta semana, mais tarde e sem prazo (sem prazo vai no fim, como
 * a ordem da rota já entrega). Seção vazia não aparece.
 *
 * Atrasada é a do prazo vencido AGORA (`estaAtrasada`), não só a de dia anterior: a
 * que vencia hoje às 10h, às 14h já está em Atrasadas, como o contador da aba conta.
 */
export function secoesDaLista<T extends Pick<Tarefa, "due_date" | "status">>(
  tarefas: readonly T[],
  agora: Date,
): Array<{ secao: SecaoDaLista; tarefas: T[] }> {
  const porSecao: Record<SecaoDaLista, T[]> = { atrasadas: [], hoje: [], proximas: [] };
  for (const tarefa of tarefas) {
    const faixa = faixaDePrazo(tarefa, agora);
    if (faixa === "encerrada") continue;
    if (estaAtrasada(tarefa, agora)) porSecao.atrasadas.push(tarefa);
    else if (faixa === "hoje") porSecao.hoje.push(tarefa);
    else porSecao.proximas.push(tarefa);
  }
  return (["atrasadas", "hoje", "proximas"] as const).flatMap((secao) =>
    porSecao[secao].length ? [{ secao, tarefas: porSecao[secao] }] : [],
  );
}

/** `YYYY-MM-DD` de um `Date` no fuso de quem olha (o mesmo corte de `diaLocalDoPrazo`). */
export function diaLocal(d: Date): string {
  return diaLocalDoPrazo(d.toISOString());
}

/** Os 7 dias da Agenda, a partir de hoje (meia-noite local de cada um). */
export function seteDias(agora: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i));
}

/** Um compromisso da Agenda do celular: tarefa com prazo ou agendamento, no mesmo formato. */
export interface ItemDaAgenda {
  id: string;
  tipo: "tarefa" | "compromisso";
  inicio: string;
  titulo: string;
  apoio: string | null;
}

/** Os itens de um dia, em ordem de horário. */
export function itensDoDia(itens: readonly ItemDaAgenda[], dia: string): ItemDaAgenda[] {
  return itens.filter((i) => diaLocalDoPrazo(i.inicio) === dia).sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}
