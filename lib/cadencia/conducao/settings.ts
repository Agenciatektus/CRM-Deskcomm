import { z } from "zod";

/**
 * QUEM ATENDE QUANDO O LEAD RESPONDE À CADÊNCIA — `cadence_settings.conducao`.
 *
 * Duas escolhas:
 *   - `atendente`: a conversa vai para uma pessoa (o comportamento de sempre, e
 *     o padrão de toda cadência gravada antes deste campo existir);
 *   - `ia`: um agente de IA conduz a conversa até a etapa-alvo do funil, com um
 *     objetivo (`preset`) que decide quais ferramentas ele recebe.
 *
 * Este é o RASCUNHO, editado pela tela. O que vale no ar é o snapshot gravado
 * na versão publicada (`followup_flow_versions.cadence_conducao`, migration
 * 9018) e copiado para `cadencia_conducoes` quando o lead responde. Mudar aqui
 * só vale depois de republicar.
 *
 * `modo`:
 *   - `automatico`: a IA responde sozinha (exige agente em modo automático);
 *   - `assistido`: a IA escreve e uma pessoa aprova cada resposta (aceita
 *     agente em qualquer modo).
 * O padrão do SCHEMA é `automatico` só para ler config antiga; a tela nova
 * preenche `assistido` (ver `MODO_PADRAO_DA_TELA`).
 */

export const PRESETS_DA_CONDUCAO = ["agendar_reuniao", "agendar_visita", "vender", "qualificar"] as const;
export type PresetDaConducao = (typeof PRESETS_DA_CONDUCAO)[number];

export const MODOS_DA_CONDUCAO = ["automatico", "assistido"] as const;
export type ModoDaConducao = (typeof MODOS_DA_CONDUCAO)[number];

/** O que a tela nova preenche ao escolher "Agente de IA". */
export const MODO_PADRAO_DA_TELA: ModoDaConducao = "assistido";

export const INSTRUCAO_MAX = 2000;
/** Constantes desta versão (não configuráveis): teto de turnos e validade da condução. */
export const MAX_TURNOS_POR_CONDUCAO = 30;
export const EXPIRACAO_DA_CONDUCAO_DIAS = 14;

export const conducaoAtendenteSchema = z.strictObject({
  quem_atende: z.literal("atendente"),
});

export const conducaoIaSchema = z.strictObject({
  quem_atende: z.literal("ia"),
  agent_id: z.string().uuid(),
  preset: z.enum(PRESETS_DA_CONDUCAO),
  etapa_alvo_id: z.string().uuid(),
  instrucao: z.string().trim().max(INSTRUCAO_MAX).optional(),
  modo: z.enum(MODOS_DA_CONDUCAO).default("automatico"),
});

export const conducaoDaCadenciaSchema = z.discriminatedUnion("quem_atende", [
  conducaoAtendenteSchema,
  conducaoIaSchema,
]);

export type ConducaoDaCadencia = z.infer<typeof conducaoDaCadenciaSchema>;
export type ConducaoPorIa = z.infer<typeof conducaoIaSchema>;

export const CONDUCAO_PADRAO: ConducaoDaCadencia = { quem_atende: "atendente" };

/**
 * A condução de um `cadence_settings` gravado. Ausente ou ilegível vira
 * `atendente`: na dúvida, uma pessoa atende, nunca a IA.
 */
export function conducaoDe(settings: unknown): ConducaoDaCadencia {
  if (settings === null || typeof settings !== "object") return CONDUCAO_PADRAO;
  const bruta = (settings as { conducao?: unknown }).conducao;
  if (bruta === undefined || bruta === null) return CONDUCAO_PADRAO;
  const lida = conducaoDaCadenciaSchema.safeParse(bruta);
  return lida.success ? lida.data : CONDUCAO_PADRAO;
}

/** `true` quando o `cadence_settings` traz uma `conducao` que não passa no schema. */
export function conducaoIlegivel(settings: unknown): boolean {
  if (settings === null || typeof settings !== "object") return false;
  const bruta = (settings as { conducao?: unknown }).conducao;
  if (bruta === undefined || bruta === null) return false;
  return !conducaoDaCadenciaSchema.safeParse(bruta).success;
}
