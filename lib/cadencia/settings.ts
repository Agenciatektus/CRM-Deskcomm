import { z } from "zod";

import { hashEstavel } from "./render";
import { SAIDAS_PADRAO, saidasDaCadenciaSchema } from "./saidas";

/**
 * CONFIGURAÇÃO DE UMA CADÊNCIA — `followup_flow_pointers.cadence_settings`.
 *
 * Mora no pointer (e não na versão do grafo) porque é política de ENVIO, não
 * passo do fluxo: trocar o horário comercial não pede republicar a régua.
 *
 * O que cada campo controla, e quem o aplica:
 *   - `janela` → `followup-turn` adia o envio até a próxima abertura
 *     (mesma régua de `janela-de-followup.ts`, no fuso da organização);
 *   - `espacamento` → intervalo sorteado entre dois envios AUTOMÁTICOS do mesmo
 *     número, avaliado SOB o lock do número em `runBeforeSend` — nunca um
 *     `sleep` segurando o lock (ele travaria o número inteiro, IA inclusive);
 *   - `legal_basis_ref` → base legal (LIA) do contato frio; sem ela a
 *     publicação é recusada (gate LGPD de prospecção);
 *   - `max_inscricoes_dia` → freio de volume no lugar do "interruptor" do
 *     agente de IA, que a cadência não exige.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const janelaDaCadenciaSchema = z
  .strictObject({
    start: z.string().regex(HHMM, "Use HH:MM"),
    end: z.string().regex(HHMM, "Use HH:MM"),
    /** 0 = domingo … 6 = sábado (mesma convenção de `janela-de-atendimento`). */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  })
  .refine((j) => j.start < j.end, {
    message: "O horário de início tem de ser antes do fim (janela que cruza a meia-noite não é aceita).",
    path: ["end"],
  })
  .refine((j) => new Set(j.weekdays).size === j.weekdays.length, {
    message: "Dia da semana repetido.",
    path: ["weekdays"],
  });

export const ESPACAMENTO_MINIMO_S = 30;
export const ESPACAMENTO_MAXIMO_S = 900;
export const MAX_INSCRICOES_DIA_TETO = 500;

export const cadenceSettingsSchema = z.strictObject({
  janela: janelaDaCadenciaSchema,
  espacamento: z
    .strictObject({
      min_s: z.number().int().min(ESPACAMENTO_MINIMO_S).max(ESPACAMENTO_MAXIMO_S),
      max_s: z.number().int().min(ESPACAMENTO_MINIMO_S).max(ESPACAMENTO_MAXIMO_S),
    })
    .refine((e) => e.min_s <= e.max_s, {
      message: "O intervalo mínimo não pode passar do máximo.",
      path: ["max_s"],
    }),
  legal_basis_ref: z.string().trim().min(3).max(200),
  max_inscricoes_dia: z.number().int().min(1).max(MAX_INSCRICOES_DIA_TETO),
  /** Opcional: cadência gravada antes dele recebe `SAIDAS_PADRAO` (ver `saidasDe`). */
  saidas: saidasDaCadenciaSchema.optional(),
});

export type CadenceSettings = z.infer<typeof cadenceSettingsSchema>;

/** Padrão da tela nova: seg–sex, 08:00–18:00, 45–120 s, 100 inscrições/dia. */
export const CADENCE_SETTINGS_PADRAO: Omit<CadenceSettings, "legal_basis_ref"> = {
  janela: { start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] },
  espacamento: { min_s: 45, max_s: 120 },
  max_inscricoes_dia: 100,
  saidas: SAIDAS_PADRAO,
};

/**
 * Espaçamento entre envios automáticos do mesmo número — decisão PURA.
 *
 * Avaliada sob o `pg_advisory_xact_lock` do número (ver `runBeforeSend`): o
 * `lastSentAt` que ela lê já inclui o envio que o worker anterior efetivou.
 * O alvo é sorteado a CADA tentativa dentro de [min, max]; quem é adiado volta
 * em `ultimo + alvo`, e o próximo sorteio o espalha de novo — sem fila
 * cadenciada em passo fixo, que é o padrão que o WhatsApp reconhece.
 */
export function decidirEspacamento(input: {
  agora: Date;
  ultimoEnvio: Date | null;
  minMs: number;
  maxMs: number;
  rng?: () => number;
}): { permite: true } | { permite: false; proximoEm: Date } {
  if (input.ultimoEnvio === null) return { permite: true };
  const rng = input.rng ?? Math.random;
  const alvoMs = input.minMs + Math.floor(rng() * (input.maxMs - input.minMs + 1));
  const decorrido = input.agora.getTime() - input.ultimoEnvio.getTime();
  if (decorrido >= alvoMs) return { permite: true };
  return { permite: false, proximoEm: new Date(input.ultimoEnvio.getTime() + alvoMs) };
}

/**
 * Sorteio FIXO por semente (job da cadência). Sem ele, cada tentativa adiada
 * sorteava um alvo novo: quem voltou em `ultimo + 50 s` podia tirar 110 s na
 * volta e ser adiado de novo — o intervalo real deixava de ser [min, max] e
 * virava o MÁXIMO de vários sorteios. Com a semente, o mesmo job tem o mesmo
 * alvo em todas as voltas, e jobs diferentes continuam espalhados.
 */
export function rngDaSemente(semente: string): () => number {
  const fracao = (hashEstavel(semente) % 1_000_000) / 1_000_000;
  return () => fracao;
}
