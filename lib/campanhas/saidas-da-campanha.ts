/**
 * QUANDO A RÉGUA DA CAMPANHA PARA DE FALAR COM UMA PESSOA — puro, sem banco.
 *
 * ═══ O que esta fatia acrescenta, e o que já existia ═══
 *
 * Os DESFECHOS já existem e já funcionam: `lib/cadencia/saidas.ts` sabe parar
 * por negócio ganho, negócio perdido, negócio removido, etapa do funil,
 * etiqueta e "um humano assumiu", e a resposta do lead encerra por fora disso
 * (`cancel_on_reply`, em `lib/followup/reactivity.ts`). O que faltava era o
 * OPERADOR escolher: `politicaDaRegua` derivava as saídas com valores fixos no
 * código, e a campanha não tinha onde dizer "pare quando o card entrar em
 * Negociação" ou "pare quando ganhar a etiqueta Reunião agendada".
 *
 * Então aqui não há motor, desfecho novo nem execução: só a LEITURA do que o
 * operador gravou em `campaigns.saidas` (migration 9046), no vocabulário que o
 * motor de follow-up já consome.
 *
 * ═══ Por que a leitura falha FECHADA, ao contrário da dos passos ═══
 *
 * `passosGuardados` lê jsonb inválido como lista VAZIA, e ali isso é seguro:
 * campanha sem passos não publica régua, não inscreve ninguém e não fala duas
 * vezes com nada. O erro, no pior caso, é a régua não existir.
 *
 * Com as saídas o sinal se inverte. Uma campanha com «pare na etapa Fechamento»
 * cujo jsonb ficou ilegível, lido como padrão, perderia justamente a etapa: a
 * régua seguiria viva mandando abordagem de prospecção para quem já está em
 * fechamento. Configuração que não dá para ler tem de PARAR a régua, e é por
 * isso que `lerSaidasDaCampanha` devolve recusa em vez de um padrão, e que
 * `politicaDaRegua` não tem como produzir política sem passar por ela.
 *
 * ⚠️ O LIMITE EXATO DESSA GARANTIA, dito aqui porque prometer além dele seria
 * pior do que não prometer nada.
 *
 * O que este módulo garante: nada que a campanha PUBLIQUE é mais frouxo do que
 * o que ela tem gravado. Se a coluna não dá para ler, não sai publicação.
 *
 * O que ele NÃO garante: a camada de baixo. O motor executa
 * `followup_flow_pointers.cadence_settings`, o SNAPSHOT da publicação, e quem o
 * lê é `saidasDe` (`lib/cadencia/saidas.ts`), que falha ABERTA — snapshot sem a
 * chave `saidas`, ou com ela corrompida, cai em `SAIDAS_PADRAO` e a régua perde
 * a etapa e a etiqueta que o operador escolheu, calada. Isso é compartilhado com
 * a cadência, está em produção desde a 9016 e está FORA do alcance desta fatia
 * (mexer em `saidasDe` mudaria o comportamento de toda cadência existente, que é
 * o limite nº 3 da fatia).
 *
 * A consequência prática: corromper a linha de `campaigns` não enfraquece a
 * régua que já está no ar — ela nem é lida —, mas corromper o SNAPSHOT
 * enfraquece, e esta fatia não fecha esse caminho. Ele exige uma fatia própria.
 */
import {
  SAIDAS_PADRAO,
  saidasDaCadenciaSchema,
  type SaidasDaCadencia,
} from "@/lib/cadencia/saidas";

/**
 * O que uma campanha sem escolha nenhuma tem — e é, byte a byte, o literal que
 * `politicaDaRegua` escrevia à mão antes desta fatia:
 *
 *     saidas: { etiquetas: [], etapas: [], ao_fechar: true, humano_assumir: true }
 *
 * Vem de `SAIDAS_PADRAO` (`lib/cadencia/saidas.ts`) em vez de ser reescrito
 * aqui: duas cópias do mesmo padrão divergem no primeiro ajuste, e divergir
 * neste valor significa régua de campanha parando por um critério e régua de
 * cadência por outro. `saidas-da-campanha.test.ts` cobra a igualdade com o
 * literal antigo, para a cadência não poder mudar o comportamento da campanha
 * existente sem alguém ficar vermelho.
 */
export const SAIDAS_DA_CAMPANHA_PADRAO: SaidasDaCadencia = Object.freeze({
  ...SAIDAS_PADRAO,
  // Cópia das listas, e `freeze`: o valor é gravado em
  // `followup_flow_pointers.cadence_settings` e lido pela tela, e um `push`
  // distraído em qualquer um desses lugares passaria a mudar o padrão de TODAS
  // as campanhas até o processo reiniciar.
  etiquetas: Object.freeze([...SAIDAS_PADRAO.etiquetas]) as string[],
  etapas: Object.freeze([...SAIDAS_PADRAO.etapas]) as string[],
}) as SaidasDaCadencia;

/**
 * Uma cópia FRESCA e mutável do padrão.
 *
 * `SAIDAS_DA_CAMPANHA_PADRAO` é congelado (ele é a referência canônica, e vai
 * para dois lugares que não deveriam poder alterá-lo). Mas quem recebe o padrão
 * é, metade das vezes, o `useState` de um editor, e objeto selado em estado de
 * React é armadilha que só aparece no primeiro clique de quem for mexer no
 * editor depois. Então a referência fica selada e o que circula é cópia.
 */
function copiaDoPadrao(): SaidasDaCadencia {
  return {
    ...SAIDAS_DA_CAMPANHA_PADRAO,
    etiquetas: [...SAIDAS_DA_CAMPANHA_PADRAO.etiquetas],
    etapas: [...SAIDAS_DA_CAMPANHA_PADRAO.etapas],
  };
}

export type LeituraDasSaidas =
  | { ok: true; saidas: SaidasDaCadencia }
  | { ok: false; mensagem: string };

/**
 * A frase que o operador lê quando o valor gravado não dá para ler.
 *
 * Diz onde consertar, porque "configuração inválida" manda procurar defeito
 * nosso num campo que ele reescolhe em dez segundos.
 */
export const MENSAGEM_SAIDAS_ILEGIVEIS =
  "Não foi possível ler quando esta campanha deve parar de falar com cada pessoa, " +
  "então a régua não vai ao ar: sem essa configuração ela continuaria insistindo com quem " +
  "já devia ter saído. Abra «Quando a régua para», confira as opções e salve de novo.";

/**
 * Lê `campaigns.saidas`. `null` (ou objeto vazio) é a campanha que nunca abriu a
 * seção, e ela recebe o padrão — o MESMO comportamento de antes desta fatia.
 * Qualquer outra coisa que o Zod recuse é recusa, não padrão (ver o cabeçalho).
 */
export function lerSaidasDaCampanha(valor: unknown): LeituraDasSaidas {
  if (valor === null || valor === undefined) return { ok: true, saidas: copiaDoPadrao() };
  const lido = saidasDaCadenciaSchema.safeParse(valor);
  if (!lido.success) return { ok: false, mensagem: MENSAGEM_SAIDAS_ILEGIVEIS };
  return { ok: true, saidas: lido.data };
}

/**
 * O que impede estas saídas de ir ao ar — frase pronta, ou `null`.
 *
 * Roda no gate de `faltaParaEnviar` (preparar, iniciar, agendar e testar) pelo
 * mesmo motivo que `problemaNosPassos`: descobrir na publicação da régua faria a
 * campanha entrar em `preparing` e gravar a lista inteira antes de dizer o que
 * se sabia na primeira linha.
 */
export function problemaNasSaidas(valor: unknown): string | null {
  const lido = lerSaidasDaCampanha(valor);
  return lido.ok ? null : lido.mensagem;
}

/**
 * O valor gravado é um OBJETO jsonb, legível ou não?
 *
 * Serve a `duplicarAcao`, que precisa distinguir dois ilegíveis: o que o CHECK
 * `campaigns_saidas_validas` aceita gravar (objeto com campo errado) e o que ele
 * recusa (array, string, número). O primeiro é copiado como está, para a cópia
 * herdar a recusa em vez de virar o padrão por conta própria; o segundo não tem
 * como ser copiado, e nunca descreveu configuração nenhuma.
 */
export function ehObjetoDeSaidas(valor: unknown): boolean {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * O valor para a TELA, que nunca quebra.
 *
 * A tela é onde o operador CONSERTA uma configuração ilegível, então ela tem de
 * renderizar: um editor que estoura em `saidas.etiquetas.join` deixaria a
 * campanha sem caminho de volta. Cair no padrão aqui NÃO é falha aberta — o
 * padrão aparece na tela, com a frase da recusa já mostrada pelo gate, e só
 * passa a valer se a pessoa salvar; e o servidor decide pela COLUNA, não por
 * isto.
 */
export function saidasParaATela(valor: unknown): SaidasDaCadencia {
  const lido = lerSaidasDaCampanha(valor);
  return lido.ok ? lido.saidas : copiaDoPadrao();
}

/**
 * Esta campanha mudou alguma saída em relação ao padrão?
 *
 * Só para a TELA decidir se vale mostrar o resumo na tela de detalhe. Nenhuma
 * decisão de envio depende disto.
 */
export function saidasForamEscolhidas(s: SaidasDaCadencia): boolean {
  return (
    s.etiquetas.length > 0 ||
    s.etapas.length > 0 ||
    s.ao_fechar !== SAIDAS_DA_CAMPANHA_PADRAO.ao_fechar ||
    s.humano_assumir !== SAIDAS_DA_CAMPANHA_PADRAO.humano_assumir
  );
}
