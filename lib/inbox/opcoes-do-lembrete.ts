import { format, type Locale } from "date-fns";

/**
 * As opções do "Lembrar depois" do cabeçalho do chat, sem React.
 *
 * Pura e com `agora` por parâmetro pelo mesmo motivo de
 * `components/inbox/painel/prazos.ts`: um teste de "Hoje 18:00" que dependesse
 * do relógio passaria de manhã e reprovaria à noite, e não vigiaria nada.
 *
 * Tudo no fuso de QUEM CLICA (`new Date(y, m, d, h)`), nunca em UTC: quem
 * escolhe "Amanhã 9:00" em Manaus quer 9h de Manaus. O ISO que vai para a rota
 * carrega o instante, e a coluna é `timestamptz`.
 */

export type IdDoLembrete = "em_1_hora" | "hoje_18" | "amanha_9" | "em_1_semana";

export interface OpcaoDoLembrete {
  id: IdDoLembrete;
  /** Chave de `t()`: o rótulo em português é a chave do dicionário. */
  rotulo: string;
  quando: Date;
}

function noDia(base: Date, diasDepois: number, hora: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diasDepois, hora, 0, 0, 0);
}

/**
 * "Hoje 18:00" depois das 18h viraria um lembrete no passado. Nesse caso o
 * segundo lugar passa a ser "Amanhã 9:00", que é o "fim do expediente" seguinte.
 *
 * Como o terceiro lugar também é "Amanhã 9:00", a lista tira a repetição: dois
 * botões para o MESMO instante obrigam a pessoa a pensar se há diferença entre
 * eles, e não há. Depois das 18h ficam três opções.
 */
export function opcoesDoLembrete(agora: Date = new Date()): OpcaoDoLembrete[] {
  const hoje18 = noDia(agora, 0, 18);
  const amanha9 = noDia(agora, 1, 9);
  const opcoes: OpcaoDoLembrete[] = [
    { id: "em_1_hora", rotulo: "Em 1 hora", quando: new Date(agora.getTime() + 3_600_000) },
    hoje18.getTime() > agora.getTime()
      ? { id: "hoje_18", rotulo: "Hoje", quando: hoje18 }
      : { id: "amanha_9", rotulo: "Amanhã", quando: amanha9 },
    { id: "amanha_9", rotulo: "Amanhã", quando: amanha9 },
    // Mesmo dia da semana e mesma hora: "daqui a uma semana" é o que a pessoa
    // diz, e é o que ela espera ver acontecer.
    {
      id: "em_1_semana",
      rotulo: "Em 1 semana",
      quando: new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate() + 7,
        agora.getHours(),
        agora.getMinutes(),
      ),
    },
  ];
  const vistos = new Set<number>();
  return opcoes.filter((o) => {
    if (vistos.has(o.quando.getTime())) return false;
    vistos.add(o.quando.getTime());
    return true;
  });
}

/** O lembrete está valendo? Um `snooze_until` vencido não é lembrete ativo. */
export function lembreteAtivo(snoozeUntil: string | null | undefined, agora: Date = new Date()): boolean {
  if (!snoozeUntil) return false;
  const quando = new Date(snoozeUntil).getTime();
  return Number.isFinite(quando) && quando > agora.getTime();
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Hoje 18:00", "Amanhã 09:00" ou "seg 13 out, 09:00": o dia por extenso só quando ele é longe. */
export function quandoDoLembrete(quando: Date, agora: Date, locale: Locale, t: (s: string) => string): string {
  const hora = format(quando, "p", { locale });
  if (mesmoDia(quando, agora)) return `${t("Hoje")} ${hora}`;
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  if (mesmoDia(quando, amanha)) return `${t("Amanhã")} ${hora}`;
  return format(quando, "EEE d MMM, p", { locale });
}
