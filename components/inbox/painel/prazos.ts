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

export const ATALHOS_DE_QUANDO = ["hoje_18", "amanha_9", "em_3_dias_9"] as const;
export type AtalhoDeQuando = (typeof ATALHOS_DE_QUANDO)[number];

function noDia(base: Date, diasDepois: number, hora: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diasDepois, hora, 0, 0, 0);
}

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

/** `"9:05"` ou `"09:05"` → `[9, 5]`; qualquer outra coisa → `null`. */
export function horarioDigitado(texto: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return [h, min];
}

export function juntaDiaEHora(dia: Date, hora: number, minuto: number): Date {
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hora, minuto, 0, 0);
}

export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * As células do mês, começando no domingo da primeira semana e terminando no
 * sábado da última: a grade sempre fecha em semanas inteiras.
 */
export function diasDaGrade(mes: Date): Date[] {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const inicio = new Date(primeiro.getFullYear(), primeiro.getMonth(), 1 - primeiro.getDay());
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const total = primeiro.getDay() + ultimo.getDate();
  const semanas = Math.ceil(total / 7);
  return Array.from({ length: semanas * 7 }, (_, i) =>
    new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i),
  );
}

/** Os horários redondos oferecidos na grade, do começo ao fim do expediente. */
export const HORARIOS_SUGERIDOS = [
  [9, 0], [10, 0], [11, 0], [12, 0], [14, 0], [15, 0], [16, 0], [18, 0],
] as const;
