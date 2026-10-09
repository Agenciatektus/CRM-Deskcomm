/**
 * O MOVIMENTO DE ETAPA FEITO POR UMA RÉGUA — a marca que quem reage precisa ler.
 *
 * ═══ O laço que isto corta ═══
 *
 * O passo `mover_etapa` de uma régua de prospecção (cadência 9016, campanha
 * 9037) move o card pelo `moveLeadHandler`, que emite `lead.stage_changed` como
 * qualquer movimento humano. Com a entrada contínua da campanha (9039), uma
 * régua que mova para a etapa em que a campanha está armada fecha um LAÇO:
 *
 *   abordagem → passo move o card → `lead.stage_changed` → alistamento →
 *   abordagem → …
 *
 * Ele terminava mesmo sem esta marca, mas por dois EFEITOS COLATERAIS: o
 * `campaign_recipients_contato_unico` da própria campanha e o veto "já em
 * campanha" lendo também linha EXCLUÍDA. O segundo foi estreitado no mesmo
 * parecer que pediu esta marca (o veto passou a olhar só quem é elegível e dos
 * últimos 30 dias) — ou seja, a trava que segurava o laço ia embora no conserto
 * de outra coisa. Depender de efeito colateral para não disparar em massa é
 * depender de algo que o próximo commit apaga sem saber que apagou.
 *
 * ═══ Por que marca no EVENTO, e não guarda no consumidor ═══
 *
 * Mesmo desenho da criação em lote da 9037 (`lib/leads/criacao-em-lote.ts`):
 * quem CRIA o fato declara a origem em `metadata.via`, e quem reage decide se
 * reage. A alternativa seria o consumidor adivinhar pelo `requestId` (que a
 * cadência prefixa com `cadencia:`), e adivinhar pelo id de requisição é
 * exatamente o que aquele arquivo documenta como insuficiente: o prefixo `rule:`
 * protege o motor de automação de si mesmo e o gatilho de follow-up não o olha.
 *
 * ═══ Por que módulo próprio, sem import nenhum ═══
 *
 * Quem EMITE é `lib/cadencia/efeitos.ts`, que importa `moveLeadHandler` e, com
 * ele, meia aplicação. Quem LÊ é a decisão pura de
 * `lib/campanhas/entrada-por-etapa.ts`, que tem de ser testável sem banco. Se a
 * constante morasse no emissor, o teste da decisão arrastaria o emissor inteiro.
 */

/**
 * O valor que vai para `metadata.via` do `lead.stage_changed` emitido por um
 * passo de régua. Uma string estável: trocá-la reabre o laço em silêncio, porque
 * o consumidor volta a não reconhecer a marca.
 */
export const ORIGEM_DO_PASSO_DE_REGUA = "passo_de_regua";

/** Este `lead.stage_changed` foi um passo de régua movendo o card? */
export function movimentoDeRegua(via: unknown): boolean {
  return via === ORIGEM_DO_PASSO_DE_REGUA;
}
