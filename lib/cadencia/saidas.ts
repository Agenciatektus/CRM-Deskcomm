import { z } from "zod";

/**
 * CONDIÇÕES DE SAÍDA DE UMA CADÊNCIA — `cadence_settings.saidas`.
 *
 * A resposta do lead já encerra a régua (`cancel_on_reply`, em
 * `lib/followup/reactivity.ts`). Isto cobre o resto do que tira alguém da
 * prospecção: uma etiqueta ("Reunião agendada"), uma etapa do funil, o negócio
 * fechado, e uma pessoa do time ter assumido a conversa.
 *
 * A regra é PURA e mora aqui, com dois consumidores que precisam concordar:
 *   - `saidas.handler.ts` reage aos eventos (etiqueta posta, etapa mudada,
 *     ganho/perda) e encerra na hora;
 *   - `followup-turn.ts` reconfere antes de CADA envio, porque o evento pode
 *     chegar depois do job — e mandar a próxima mensagem para quem acabou de
 *     fechar é o erro que o operador enxerga.
 *
 * Os FATOS vêm sempre relidos do banco, nunca do payload do evento: um
 * `lead.tag_added` diz o que foi acrescentado, não o que o lead tem agora.
 */

export const MAX_ETIQUETAS_DE_SAIDA = 20;
export const MAX_ETAPAS_DE_SAIDA = 20;

/** Etiqueta comparada como o resto do produto compara: sem espaço nas pontas e sem caixa. */
export function normalizarEtiqueta(tag: string): string {
  return tag.trim().toLowerCase();
}

export const saidasDaCadenciaSchema = z.strictObject({
  etiquetas: z.array(z.string().trim().min(1).max(60)).max(MAX_ETIQUETAS_DE_SAIDA).default([]),
  etapas: z.array(z.string().uuid()).max(MAX_ETAPAS_DE_SAIDA).default([]),
  /** Negócio ganho ou perdido encerra a régua. */
  ao_fechar: z.boolean().default(true),
  /** Uma pessoa do time mandou mensagem ao lead depois da inscrição. */
  humano_assumir: z.boolean().default(true),
});

export type SaidasDaCadencia = z.infer<typeof saidasDaCadenciaSchema>;

export const SAIDAS_PADRAO: SaidasDaCadencia = {
  etiquetas: [],
  etapas: [],
  ao_fechar: true,
  humano_assumir: true,
};

/**
 * Cadência gravada antes deste campo existir não tem `saidas`. Ela ganha o
 * padrão (fechar e humano assumir encerram), que é o que o operador esperaria
 * de uma régua de prospecção — nenhuma cadência continua falando com quem já
 * comprou por falta de configuração.
 */
export function saidasDe(settings: unknown): SaidasDaCadencia {
  const bruto = (settings as { saidas?: unknown } | null)?.saidas;
  const lido = saidasDaCadenciaSchema.safeParse(bruto ?? {});
  return lido.success ? lido.data : SAIDAS_PADRAO;
}

export interface FatosDaSaida {
  /** `null` quando o negócio não existe mais (apagado): conta como fechado. */
  lead: { stage_id: string; status: string; tags: readonly string[] } | null;
  tagsDoContato: readonly string[];
  /** Uma pessoa mandou mensagem ao contato depois da inscrição. */
  humanoFalouDepois: boolean;
}

export type MotivoDeSaida =
  | "saida_negocio_ganho"
  | "saida_negocio_perdido"
  | "saida_negocio_removido"
  | "saida_etapa"
  | "saida_etiqueta"
  | "saida_humano_assumiu";

/** O `outcome` da tabela é um vocabulário fechado; só o que casa com ele vai. */
export const OUTCOME_DA_SAIDA: Record<MotivoDeSaida, "converted" | "handoff" | null> = {
  saida_negocio_ganho: "converted",
  saida_negocio_perdido: null,
  saida_negocio_removido: null,
  saida_etapa: null,
  saida_etiqueta: null,
  saida_humano_assumiu: "handoff",
};

/**
 * A régua deve parar? Devolve o PRIMEIRO motivo, na ordem do mais forte para o
 * mais fraco: o negócio fechado é fato, a etiqueta é marcação.
 */
export function motivoDeSaida(saidas: SaidasDaCadencia, fatos: FatosDaSaida): MotivoDeSaida | null {
  const { lead } = fatos;
  if (lead === null) return saidas.ao_fechar ? "saida_negocio_removido" : null;
  if (saidas.ao_fechar && lead.status === "won") return "saida_negocio_ganho";
  if (saidas.ao_fechar && lead.status === "lost") return "saida_negocio_perdido";
  if (saidas.etapas.includes(lead.stage_id)) return "saida_etapa";
  if (saidas.etiquetas.length > 0) {
    const alvo = new Set(saidas.etiquetas.map(normalizarEtiqueta));
    const tem = [...lead.tags, ...fatos.tagsDoContato].some((t) => alvo.has(normalizarEtiqueta(t)));
    if (tem) return "saida_etiqueta";
  }
  if (saidas.humano_assumir && fatos.humanoFalouDepois) return "saida_humano_assumiu";
  return null;
}
