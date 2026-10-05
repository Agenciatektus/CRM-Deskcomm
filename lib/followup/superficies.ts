/**
 * AS SUPERFÍCIES DE PROSPECÇÃO — um lugar só para a pergunta "este pointer é
 * uma régua de prospecção?".
 *
 * `followup_flow_pointers.surface` vale hoje cinco coisas
 * (`FOLLOWUP_FLOW_SURFACES`, em `api-schemas.ts`), e duas delas são réguas de
 * prospecção que compartilham a MESMA máquina: `cadence` (migration 9016, a
 * cadência do funil) e `campaign` (migration 9035, os passos da campanha).
 *
 * Existe porque a alternativa é `surface === 'cadence' || surface === 'campaign'`
 * espalhado por dez arquivos — e uma superfície nova de prospecção exigiria
 * achar os dez. O dia em que faltar UM, o fluxo fica `active` e não envia (ou
 * pior: entra num gatilho que não é dele) sem erro nenhum na tela. Já é o modo
 * de falhar mais caro desta parte do produto.
 *
 * ⚠️ O que NÃO entra aqui: as decisões que são da CADÊNCIA e não da prospecção
 * em geral — a condução da resposta (`lib/agent-engine/edge/crm/drain.ts`), as
 * condições de saída configuráveis (`lib/cadencia/saidas.handler.ts`) e os
 * gatilhos de etiqueta e de tempo. A campanha não as tem, e incluí-la neles
 * mudaria comportamento que ninguém pediu.
 */

/** As duas superfícies que rodam uma régua de prospecção com `cadence_settings`. */
export const SUPERFICIES_DE_PROSPECCAO = ["cadence", "campaign"] as const;

export type SuperficieDeProspeccao = (typeof SUPERFICIES_DE_PROSPECCAO)[number];

/** `true` para cadência e para a régua de campanha. */
export function ehProspeccao(surface: unknown): surface is SuperficieDeProspeccao {
  return (SUPERFICIES_DE_PROSPECCAO as readonly unknown[]).includes(surface);
}

/**
 * Superfícies que NÃO se inscrevem pelos gatilhos genéricos de follow-up
 * (silêncio, caso aberto, enroll manual). A cadência tem a porta dela
 * (`lib/cadencia/inscrever.ts`); a campanha inscreve no envio da 1ª mensagem
 * (`lib/campanhas/rodada.ts`); o roteiro de atendimento começa no turno.
 */
export function foraDosGatilhosGenericos(surface: unknown): boolean {
  return surface === "atendimento" || ehProspeccao(surface);
}
