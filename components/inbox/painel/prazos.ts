/**
 * A aritmética de "quando" do Próximo passo, sem React.
 *
 * Pura e com `agora` por parâmetro pelo mesmo motivo de `lib/tarefas/tipos.ts`:
 * um teste de "Hoje 18:00" que dependesse do relógio ficaria verde de manhã e
 * vermelho à noite, e não vigiaria nada.
 *
 * Tudo no fuso de QUEM OLHA (`new Date(y, m, d, h)`), nunca em UTC: a pessoa que
 * clica "Amanhã 9:00" em Brasília quer 9h de Brasília. O ISO que vai para a rota
 * carrega o offset, e a coluna é `timestamptz`.
 */

import { noDia } from "@/lib/ui/calendario";

export const ATALHOS_DE_QUANDO = ["hoje_18", "amanha_9", "em_3_dias_9"] as const;
export type AtalhoDeQuando = (typeof ATALHOS_DE_QUANDO)[number];

export function prazoDoAtalho(atalho: AtalhoDeQuando, agora: Date = new Date()): Date {
  if (atalho === "hoje_18") return noDia(agora, 0, 18);
  if (atalho === "amanha_9") return noDia(agora, 1, 9);
  return noDia(agora, 3, 9);
}

/**
 * "Hoje 18:00" depois das 18h criaria uma tarefa JÁ atrasada. O atalho some do
 * jeito honesto: desabilitado, para a fileira não mudar de forma ao longo do dia.
 */
export function atalhoDisponivel(atalho: AtalhoDeQuando, agora: Date = new Date()): boolean {
  return prazoDoAtalho(atalho, agora).getTime() > agora.getTime();
}

export {
  ATALHOS_DE_DIA,
  HORARIOS_SUGERIDOS,
  diaDoAtalho,
  diasDaGrade,
  horarioDigitado,
  juntaDiaEHora,
  mesmoDia,
  type AtalhoDeDia,
} from "@/lib/ui/calendario";
