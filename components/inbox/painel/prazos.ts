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

/**
 * Os atalhos de DIA do seletor (quadro DS, "Seletor de data e horário"): Hoje,
 * Amanhã, o próximo dia útil (o rótulo é o nome do dia, "Segunda" numa sexta) e
 * Em 7 dias. Escolhem o dia; o horário vem dos chips logo abaixo do calendário.
 */
export const ATALHOS_DE_DIA = ["hoje", "amanha", "proximo_util", "em_7_dias"] as const;
export type AtalhoDeDia = (typeof ATALHOS_DE_DIA)[number];

export function diaDoAtalho(atalho: AtalhoDeDia, agora: Date = new Date()): Date {
  if (atalho === "hoje") return noDia(agora, 0, 0);
  if (atalho === "amanha") return noDia(agora, 1, 0);
  if (atalho === "em_7_dias") return noDia(agora, 7, 0);
  // Próximo dia útil DEPOIS de hoje: sábado e domingo pulam para segunda.
  for (let n = 1; n <= 7; n += 1) {
    const d = noDia(agora, n, 0);
    if (d.getDay() !== 0 && d.getDay() !== 6) return d;
  }
  return noDia(agora, 1, 0);
}

/** `"9:05"`, `"09:05"`, `"905"` ou `"1430"` → `[h, m]`; qualquer outra coisa → `null`. */
export function horarioDigitado(texto: string): [number, number] | null {
  const limpo = texto.trim();
  const corrido = /^(\d{1,2})(\d{2})$/.exec(limpo);
  const m = corrido ?? /^(\d{1,2}):(\d{2})$/.exec(limpo);
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

/** Os horários comuns em chips (quadro DS: 08:00, 09:00, 10:00, 11:00…). */
export const HORARIOS_SUGERIDOS = [
  [8, 0], [9, 0], [10, 0], [11, 0], [14, 0], [15, 0], [16, 0], [18, 0],
] as const;
