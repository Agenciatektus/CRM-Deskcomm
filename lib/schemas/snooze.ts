import { z } from "zod";

/**
 * O lembrete aceita DUAS formas, e as duas continuam válidas.
 *
 * `duration_hours` (1, 3 ou 24) é o contrato antigo, que o MCP e qualquer
 * cliente já em uso mandam. `snooze_until` é o instante exato, calculado na
 * tela no fuso de quem clica: "Amanhã 9:00" não é um número fixo de horas, e
 * sem esta forma a tela só poderia oferecer durações redondas.
 *
 * AS DUAS JUNTAS são recusadas (422), em vez de uma vencer em silêncio: o
 * `z.union` pegaria a primeira que casasse e descartaria a outra chave, e o
 * lembrete cairia num horário que ninguém pediu. Cada forma declara a chave da
 * outra como proibida (`z.never()`), então o pedido ambíguo não casa com nenhuma.
 *
 * `snooze_until` exige fuso (`offset: true` aceita `Z` ou `-03:00`): sem
 * ele, a mesma string vira instantes diferentes conforme o relógio de quem lê.
 *
 * O teto de 90 dias existe porque um lembrete para daqui a um trimestre já é,
 * na prática, um lembrete que ninguém vai ver chegar. O piso (no futuro) e o
 * teto são checados na rota, que conhece o relógio do servidor.
 */
export const SNOOZE_MAX_DIAS = 90;

const porDuracao = z.object({
  duration_hours: z.union([z.literal(1), z.literal(3), z.literal(24)]),
  snooze_until: z.never().optional(),
});
const porInstante = z.object({
  snooze_until: z.string().datetime({ offset: true }),
  duration_hours: z.never().optional(),
});

export const snoozeSchema = z.union([porDuracao, porInstante]);
export type SnoozeInput = z.infer<typeof snoozeSchema>;
