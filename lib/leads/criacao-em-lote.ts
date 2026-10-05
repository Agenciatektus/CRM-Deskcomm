/**
 * CRIAÇÃO DE CARD EM LOTE — as origens que NÃO acordam o gatilho "Lead criado".
 *
 * ═══ O buraco que isto tampa ═══
 *
 * `lead.created` arma o gatilho de follow-up "Lead criado", que manda uma
 * mensagem proativa. Quem cria UM card por vez (cadastro na tela, API, a
 * conversa que abre o primeiro card) quer exatamente isso. Quem cria CENTENAS
 * de uma vez, não: 400 linhas de planilha viravam 400 mensagens proativas no
 * mesmo minuto — o disparo em massa que a doutrina anti-banimento existe para
 * impedir. A importação já chegava marcada por isso (`metadata.via`).
 *
 * A campanha com passos (migration 9035) abre o MESMO buraco, e maior: ela cria
 * um card por pessoa abordada, e a campanha típica aborda centenas. Pior que a
 * planilha, porque a pessoa acabou de receber a abordagem da campanha — uma
 * segunda mensagem, de outro fluxo, no mesmo minuto, é a cara do robô.
 *
 * ═══ Por que uma LISTA, e não um `if` por origem ═══
 *
 * Era um `if (via === ORIGEM_DA_PLANILHA)` dentro de `gatilho-lead.ts`. Com dois
 * casos já valia virar conjunto: a terceira origem em lote que aparecer
 * (importação de CRM antigo, sincronismo de base) tem de ser lembrada em UM
 * lugar, e não achada por quem for ler o gatilho. O modo de falhar é caro e
 * silencioso: o gatilho não reclama, ele MANDA.
 */
import { ORIGEM_CAMPANHA } from "@/lib/campanhas/origem-do-lead";

import { ORIGEM_DA_PLANILHA } from "./planilha";

/**
 * As origens de criação em lote. O valor vai para `lead.created` em
 * `metadata.via` (`createLeadHandler`), nunca em `crm_leads.source` — `source`
 * diz de onde o NEGÓCIO veio e é lido pelas métricas de origem do funil;
 * `metadata.via` diz COMO a linha nasceu e é lido só por quem decide reagir.
 */
export const ORIGENS_DE_CRIACAO_EM_LOTE: readonly string[] = [ORIGEM_DA_PLANILHA, ORIGEM_CAMPANHA];

/** Este `lead.created` nasceu de uma criação em lote? */
export function criacaoEmLote(via: unknown): boolean {
  return typeof via === "string" && ORIGENS_DE_CRIACAO_EM_LOTE.includes(via);
}
