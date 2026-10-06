/**
 * O SEGUNDO MODO DE PÚBLICO DA CAMPANHA — entrada CONTÍNUA por etapa do funil.
 * Puro: nada aqui toca banco nem rede.
 *
 * ═══ Os dois modos, e por que a lista continua o padrão ═══
 *
 * LISTA (`entrada_continua = false`, o default e o comportamento de toda
 * campanha anterior à 9038): o recorte vira `campaign_recipients` na preparação,
 * o operador CONFERE o número e o texto, e depois disso a lista não muda mais. É
 * o que torna a abordagem auditável — "por que esta pessoa recebeu?" tem resposta
 * porque o recorte de ontem continua existindo.
 *
 * CONTÍNUO (`entrada_continua = true` + `entrada_etapa_id`): quem CAI na etapa
 * escolhida é abordado, uma linha por chegada
 * (`lib/campanhas/entrada-por-etapa.ts`). O que ele resolve é o que a lista não
 * resolve: lead novo entra na etapa um por vez, ao longo do mês, e alcançá-lo
 * com lista fixa exigiria preparar uma campanha por dia.
 *
 * ═══ Como a REVISÃO da 1ª mensagem sobrevive sem um "antes" ═══
 *
 * No modo lista o operador lê o texto e a contagem antes de apertar Iniciar. No
 * contínuo não existe esse instante — a campanha fica de pé e aborda quem
 * aparecer. Então a revisão é preservada por três coisas, e nenhuma delas é
 * opcional:
 *
 *   1. A campanha contínua passa pela MESMA máquina de estados. Ela só sai de
 *      `draft` por Preparar, e Preparar roda o MESMO gate de conteúdo
 *      (`faltaParaEnviar`: texto não vazio, `{a|b}` que fecha, passos coerentes,
 *      base legal com LIA) e publica a régua. De `ready` nada sai sozinho: é o
 *      clique em Iniciar que arma a entrada.
 *   2. Preparar roda a PRÉVIA sobre a etapa escolhida, com o MESMO
 *      `renderizarVariacao` do envio (ver `filtroDaEtapaDeEntrada`). O operador
 *      lê "X pessoas estão nesta etapa hoje e receberiam isto; Y ficariam de
 *      fora, por estes motivos" — então um `{{nome}}` que falta ou um `{Olá|}`
 *      que resolve para nada aparece ANTES de qualquer envio, e não como
 *      primeira mensagem em branco no WhatsApp de um lojista.
 *   3. O texto fica CONGELADO por pessoa, como na lista: a entrada grava
 *      `rendered_body` no instante em que a pessoa entra. E o texto da campanha
 *      não muda mais depois do Iniciar — conteúdo só se edita em `draft`
 *      (`ehEditavel`), e a máquina de estados não tem caminho de `running` nem
 *      de `paused` de volta para `draft`. Para mudar a mensagem de uma campanha
 *      contínua em pé, duplica-se.
 *
 * ═══ Por que o teto e a janela são EXIGÊNCIA, e não preferência ═══
 *
 * No modo lista o volume do dia é limitado por algo que um humano olhou: o
 * recorte tem `limite` e o operador leu a contagem. Teto em branco ali é uma
 * escolha sobre uma lista conhecida.
 *
 * No contínuo não há lista, não há número para olhar e não há o instante "antes
 * de apertar". O teto diário é a ÚNICA coisa que limita quantos estranhos
 * recebem mensagem por dia, e a janela a única que impede que recebam às três da
 * manhã. Isso não é configuração: é a contenção do recurso, e por isso ela é
 * cobrada aqui, na rota de edição E num CHECK do banco (migration 9038).
 */
import { FILTRO_VAZIO, type FiltroDeAudiencia } from "./audiencia";

/**
 * O que o modo contínuo precisa saber da campanha. Recorte estreito de
 * propósito: `CampanhaCarregada` e `CampanhaRow` (da rodada) carregam colunas
 * diferentes, e as duas precisam poder responder a estas perguntas.
 */
export interface EntradaDaCampanha {
  entrada_continua: boolean;
  entrada_etapa_id: string | null;
  pipeline_id: string | null;
  teto_diario: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
}

/** Esta campanha aborda quem CHEGA na etapa, em vez de uma lista congelada? */
export function ehEntradaContinua(c: Pick<EntradaDaCampanha, "entrada_continua">): boolean {
  return c.entrada_continua === true;
}

/**
 * O que falta para esta campanha poder rodar em modo contínuo. `null` = pode.
 *
 * Devolve FRASE, e não código: o destino dela é o `mensagem` de uma recusa que o
 * operador lê na tela, e "entrada_invalida" manda ele procurar um defeito nosso
 * para algo que ele conserta em dez segundos.
 *
 * Campanha em modo LISTA sai daqui com `null` na primeira linha: nada neste
 * módulo muda o comportamento dela.
 */
export function problemaNaEntradaContinua(c: EntradaDaCampanha): string | null {
  if (!ehEntradaContinua(c)) return null;

  // O funil vem antes da etapa na frase porque é o que o operador escolhe
  // primeiro, e porque etapa sem funil seria card sem coluna — o mesmo
  // raciocínio do `refine` de `stage_id` em `schemas.ts`.
  if (!c.pipeline_id) {
    return "Escolha o funil da entrada contínua antes de preparar a campanha.";
  }
  // Etapa nula com o modo ligado não é só configuração incompleta: é também o
  // estado em que a campanha CAI quando alguém apaga a etapa (a FK da 9038 é
  // `on delete set null`). Nos dois casos a resposta é a mesma, e ela é segura —
  // o gatilho compara `entrada_etapa_id = to_stage_id` e nulo não casa nada,
  // então a campanha para de abordar em vez de abordar errado.
  if (!c.entrada_etapa_id) {
    return (
      "Escolha a etapa que inicia a abordagem. Se ela existia e foi apagada, a campanha parou " +
      "de abordar: escolha outra etapa e prepare de novo."
    );
  }
  if (c.teto_diario === null) {
    return (
      "Campanha contínua exige um máximo por dia. Sem lista para conferir antes de apertar, " +
      "ele é o que limita quantas pessoas novas a campanha aborda por dia."
    );
  }
  if (c.janela_inicio_hora === null || c.janela_fim_hora === null) {
    return (
      "Campanha contínua exige o horário de envio (das … às …). O gatilho dispara a qualquer " +
      "hora, e sem janela a abordagem sai de madrugada."
    );
  }
  return null;
}

/**
 * O recorte da PRÉVIA de uma campanha contínua: quem está na etapa HOJE.
 *
 * Reusa `filtroDeAudienciaSchema` inteiro em vez de uma consulta própria, e isso
 * é o ponto: a prévia passa por `buscarCandidatos` + `classificarAudiencia`, as
 * MESMAS funções que o modo lista usa, então ela conta pelo mesmo caminho que o
 * envio percorreria. Prévia que mede por outro caminho é prévia que mente, e a
 * mentira só aparece depois do envio.
 *
 * ⚠️ NÃO é a lista da campanha. Ninguém dessas pessoas é gravado como
 * destinatário: a prévia existe para o operador ver o texto renderizado e o
 * tamanho da etapa antes de armar o gatilho. Quem entra é quem CHEGAR depois do
 * Iniciar (ver `entrada-por-etapa.ts`).
 *
 * `audience_filter` da campanha é ignorado de propósito no modo contínuo: o
 * público é a etapa, e cruzar o gatilho com etiquetas e silêncio criaria um
 * recorte que o operador não vê em lugar nenhum e que muda sob ele a cada
 * chegada.
 */
export function filtroDaEtapaDeEntrada(
  c: Pick<EntradaDaCampanha, "pipeline_id" | "entrada_etapa_id">,
): FiltroDeAudiencia {
  return {
    ...FILTRO_VAZIO,
    funis: c.pipeline_id ? [c.pipeline_id] : [],
    etapas: c.entrada_etapa_id ? [c.entrada_etapa_id] : [],
    // Só negócio ABERTO: a etapa de um funil também guarda card ganho e perdido
    // quando alguém arrasta de volta, e abordar quem já comprou (ou já disse
    // não) com a copy de primeiro contato é o erro que não se desfaz.
    situacoes_do_negocio: ["open"],
  };
}
