/**
 * O ATRASO RELATIVO da tarefa ("atrasada há 16 dias"): quanto tempo passou do
 * prazo, na maior unidade que cabe inteira (minutos, horas, dias). O texto sai
 * de `Intl.RelativeTimeFormat` no idioma de quem lê — "há 16 dias", "hace 16
 * días" —, nunca de palavra escrita à mão.
 *
 * `null` quando não está atrasada (sem prazo, prazo no futuro ou encerrada):
 * a mesma régua de `estaAtrasada`, para o selo e o grupo "Atrasadas" nunca
 * discordarem.
 */
import { estaAtrasada, type Tarefa } from "@/lib/tarefas/tipos";

export interface AtrasoRelativo {
  valor: number;
  unidade: "minute" | "hour" | "day";
}

export function atrasoRelativo(tarefa: Pick<Tarefa, "due_date" | "status">, agora: Date = new Date()): AtrasoRelativo | null {
  if (!tarefa.due_date || !estaAtrasada(tarefa, agora)) return null;
  const minutos = Math.max(1, Math.floor((agora.getTime() - new Date(tarefa.due_date).getTime()) / 60_000));
  if (minutos < 60) return { valor: minutos, unidade: "minute" };
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return { valor: horas, unidade: "hour" };
  return { valor: Math.floor(horas / 24), unidade: "day" };
}
