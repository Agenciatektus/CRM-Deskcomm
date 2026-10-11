/**
 * QUEM ENTRA NA CAMPANHA CONTÍNUA — o lead caiu na etapa, e vira destinatário.
 *
 * ═══ A decisão que dispensa um motor novo ═══
 *
 * Isto não é um caminho de envio. O que este módulo faz é inserir UMA linha em
 * `campaign_recipients`, com o `rendered_body` já congelado pelo MESMO
 * `renderizarVariacao` da preparação. Daí para frente o `campaign-worker`
 * (`lib/campanhas/rodada.ts`) não sabe — nem precisa saber — se a linha nasceu
 * de um snapshot ou de um card arrastado: ele revalida os vetos por pessoa,
 * confere a lista de exclusão da operação, respeita o ritmo da campanha, escolhe
 * o número no rodízio, manda e inscreve na régua (9037).
 *
 * Um caminho de envio só, com os freios todos no mesmo lugar. A alternativa —
 * um despacho próprio para o modo contínuo — seria a segunda implementação dos
 * mesmos vetos, e o dia em que as duas discordassem a diferença apareceria como
 * mensagem para quem pediu para parar.
 *
 * ═══ O que é EMPRESTADO, e de onde ═══
 *
 * O evento é o `lead.stage_changed` de `lib/followup/gatilho-etapa.ts`, que já
 * lista os emissores (arrasto no Kanban, `moveLeadHandler` de MCP e automações,
 * movimento em lote e o assistente em `agent-stage-sync.ts`). A resolução
 * negócio → contato sai do adapter DELE, não de uma consulta nova. O que é
 * próprio é o consumidor: handler separado, com `consumer_key` próprio, porque
 * `event_log.consumed_by[]` é por chave e dois consumidores do mesmo evento se
 * reprocessam de forma independente (o par
 * `followupGatilhoEtapaHandler`/`avisoDeEtapaHandler` já faz isso). Enfiar a
 * campanha dentro do produtor de follow-up acoplaria a idempotência dos dois:
 * uma falha nossa marcaria o evento como consumido pelo outro.
 *
 * ═══ O anti-repetição que já existia ═══
 *
 * `campaign_recipients_contato_unico unique (campaign_id, contact_id)` existe
 * desde a 0375. Card que entra e sai da etapa dez vezes bate em 23505 nas nove
 * tentativas seguintes: UMA abordagem, não dez. `campaign_recipients_endereco_unico`
 * faz o mesmo pelo telefone, então dois cadastros gêmeos do mesmo número também
 * rendem uma só. 23505 aqui é caminho NORMAL, nunca erro.
 *
 * ⚠️ E ele vale também para o EXCLUÍDO. Quem entrou na etapa e foi vetado vira
 * linha `skipped` com o motivo — a mesma doutrina da preparação ("o excluído
 * vira LINHA, e não some"), e é o que responde "essa pessoa entrou na etapa e
 * não foi abordada; por quê?". O custo é que o veto fica FINAL para esta
 * campanha: quem entrou sem telefone e depois ganhou um não é reavaliado. É o
 * lado certo para errar — erra sempre para NÃO mandar — e é também um freio, já
 * que impede o card que vai e volta de render uma tentativa por arrasto. Quem
 * quiser reabrir a avaliação duplica a campanha.
 */
import { dayStartInTz } from "@/lib/agent-engine/pacing/engine";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { EVENTO_DE_ETAPA } from "@/lib/followup/gatilho-etapa";

import { movimentoDeRegua } from "@/lib/leads/movimento-em-regua";

import { motivoParaExcluir } from "./elegibilidade";
import type {
  ContatoDoAlvo,
  EntradaPorEtapaDeps,
  ResumoDaEntradaPorEtapa,
} from "./entrada-por-etapa.tipos";
import { renderizarVariacao, variantesDaCampanha } from "./renderizador";
import type { MotivoDeExclusao } from "./tipos";

export { EVENTO_DE_ETAPA };

// Reexportados porque a porta e a decisão são uma coisa só para quem chama: o
// handler e os testes importam de um lugar, e `entrada-por-etapa.tipos.ts` é
// detalhe de organização interna, não uma segunda API.
export type {
  CampanhaArmada,
  ContatoDoAlvo,
  EntradaPorEtapaDb,
  EntradaPorEtapaDeps,
  LinhaDoAlistamento,
  ResumoDaEntradaPorEtapa,
} from "./entrada-por-etapa.tipos";

function vazio(): ResumoDaEntradaPorEtapa {
  return {
    matched: false,
    campanhas_armadas: 0,
    alistados: 0,
    ja_na_campanha: 0,
    teto_do_dia: 0,
    anterior_ao_inicio: 0,
    sem_alvo: 0,
    veio_de_fechamento: 0,
    ja_foi_fechado: 0,
    passo_de_regua: 0,
    sem_teto: 0,
    excluidos: {},
  };
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Aplica UMA linha de `lead.stage_changed`. Chamada pelo adapter do dispatcher
 * (`entrada-por-etapa.handler.ts`) e diretamente pelos testes.
 *
 * Nunca lança por recusa: recusa é desfecho normal e vai no resumo, que o
 * handler transforma no `detail` do `event_log`.
 */
export async function alistarPorEtapa(
  deps: EntradaPorEtapaDeps,
  row: EventRow,
): Promise<ResumoDaEntradaPorEtapa> {
  const resumo = vazio();
  if (row.event_type !== EVENTO_DE_ETAPA) return resumo;

  const etapaDestino = textoOuNulo(row.payload.to_stage_id);
  const negocioId = textoOuNulo(row.entity_id);
  // Sem etapa de destino ou sem negócio o evento não descreve o fato que este
  // gatilho espera: `matched:false` faz o dispatcher registrar 'skipped'.
  if (!etapaDestino || !negocioId) return resumo;
  resumo.matched = true;

  // ═══ O MOVIMENTO FEITO PELA PRÓPRIA RÉGUA NÃO REALIMENTA O GATILHO ═══
  //
  // O passo `mover_etapa` da fatia 2 move o card pelo `moveLeadHandler`, que
  // emite `lead.stage_changed` como qualquer outro movimento. Uma régua que
  // mova para a etapa em que a campanha está armada fecha um LAÇO: abordagem →
  // passo → evento → alistamento → abordagem.
  //
  // Ele terminava hoje, mas por dois EFEITOS COLATERAIS e não por desenho: o
  // `campaign_recipients_contato_unico` da mesma campanha, e o veto "já em
  // campanha" lendo linha excluída (que o P2-1 do @Cassio_SecRev acaba de
  // estreitar, justamente). Depender de efeito colateral para não disparar em
  // massa é depender de algo que o próximo conserto apaga sem saber.
  //
  // A marca vem no metadado do evento, no mesmo padrão da criação em lote da
  // 9037 (`lib/leads/criacao-em-lote.ts`): quem move declara a origem, e quem
  // reage decide. Ver `lib/leads/movimento-em-regua.ts`.
  //
  // ⚠️ E ELE DESARMA O GATILHO INTEIRO, não só o laço. O corte é aqui, ANTES de
  // `carregaCampanhasArmadas`, então NENHUMA campanha contínua reage a movimento
  // de régua — inclusive uma campanha B armada numa etapa para onde a régua de
  // uma campanha A (ou de uma cadência) empurra o card DE PROPÓSITO. Nesse
  // desenho, o operador espera que B aborde, e B não aborda. Nada na tela conta
  // isso: o rastro é `passo_de_regua=1` no `detail` do evento.
  //
  // Aceito para este merge (o @Cassio_SecRev concordou): é falha FECHADA, e
  // distinguir "régua que fecha laço com a própria campanha" de "régua que
  // alimenta outra" pediria comparar a campanha do pointer com a campanha armada,
  // o que é decisão de produto e não de implementação. Quem reabrir isto: o corte
  // teria de descer para dentro do laço, por campanha, pulando só quando o
  // pointer que moveu o card for o da PRÓPRIA campanha armada.
  if (movimentoDeRegua((row.metadata as Record<string, unknown> | null)?.via)) {
    resumo.passo_de_regua = 1;
    return resumo;
  }

  const armadas = await deps.db.carregaCampanhasArmadas(row.organization_id, etapaDestino);
  resumo.campanhas_armadas = armadas.length;
  // Sai ANTES de consultar o negócio: a esmagadora maioria das mudanças de
  // etapa não tem campanha contínua armada, e uma ida ao banco por card
  // arrastado seria custo puro no caminho quente do CRM.
  if (armadas.length === 0) return resumo;

  // ═══ QUEM VEM DE GANHO OU DE PERDA NÃO É ABORDADO (P1-2 do @Cassio_SecRev) ═══
  //
  // O veto `aberto` logo abaixo funciona na direção aberto → fechado. Ele NÃO
  // cobre a volta, e a volta é o caso perigoso: `fn_crm_lead_close_on_stage`
  // (baseline.sql) REABRE o negócio quando `old.status in ('won','lost')` e a
  // etapa nova não fecha — põe `status = 'open'` no mesmo UPDATE que emite o
  // evento. Então o cliente que comprou em março, cujo card alguém arrasta de
  // «Ganho» para «Novo lead» em outubro, chega aqui com `aberto = true` e passa
  // por todos os vetos.
  //
  // O dano é exatamente o que o comentário do veto abaixo diz estar impedindo:
  // um cliente que já comprou recebendo a mensagem de PRIMEIRO contato. E a
  // informação que falta já vem no payload — `from_stage_id`, o mesmo campo que
  // a proveniência grava.
  //
  // Vale para GANHO e para PERDA: quem disse não em março também não quer a
  // abordagem fria de outubro, e arrastar o card de volta é triagem interna, não
  // consentimento.
  const etapaDeOrigem = textoOuNulo(row.payload.from_stage_id);
  if (etapaDeOrigem && (await deps.db.ehEtapaDeFechamento(row.organization_id, etapaDeOrigem))) {
    resumo.veio_de_fechamento = armadas.length;
    return resumo;
  }

  const negocio = await deps.db.carregaNegocio(row.organization_id, negocioId);
  // NEGÓCIO FECHADO não entra, e isto não é zelo: a etapa de um funil também
  // guarda card ganho e perdido quando alguém o arrasta de volta, e abordar com
  // a copy de primeiro contato quem já comprou — ou quem já disse não — é o erro
  // que não se desfaz. É o mesmo veto `negocio_fechado` da porta da cadência.
  // Pega a direção aberto → fechado; a VOLTA é vetada no bloco acima.
  if (!negocio || !negocio.contactId || !negocio.aberto) {
    resumo.sem_alvo = armadas.length;
    return resumo;
  }
  const contato = await deps.db.carregaContato(row.organization_id, negocio.contactId);
  if (!contato) {
    resumo.sem_alvo = armadas.length;
    return resumo;
  }

  // Sem a data de emissão não dá para afirmar que o evento é velho: falha
  // ABERTO, como pede o contrato do `EventRow` (o caminho de produção sempre a
  // traz — `drain.ts` a seleciona).
  const eventoEm = Date.parse(row.created_at ?? deps.clock().toISOString());

  for (const campanha of armadas) {
    // ─── NADA RETROATIVO ───
    // O mesmo corte de `anterior_a_publicacao` na porta da cadência, e pelo
    // mesmo motivo: armar o gatilho não pode abordar o estoque inteiro da etapa.
    // Quem já está lá é assunto do modo LISTA, que tem recorte por etapa e passa
    // pela conferência do operador. Aqui entra quem CHEGAR.
    //
    // `started_at` é reescrito no Iniciar e no Retomar, então a chegada que
    // aconteceu durante a pausa também não entra — pausar é "pare de abordar
    // gente nova", e enfileirar o que passou na pausa seria o oposto.
    const inicio = campanha.started_at ? Date.parse(campanha.started_at) : null;
    if (inicio === null || Number.isNaN(inicio) || eventoEm < inicio) {
      resumo.anterior_ao_inicio++;
      continue;
    }

    const excluir = async (motivo: MotivoDeExclusao): Promise<void> => {
      await deps.db.alista({
        organization_id: row.organization_id,
        campaign_id: campanha.id,
        contact_id: contato.contactId,
        recipient_address: null,
        status: "skipped",
        eligibility_status: "excluded",
        exclusion_reason: motivo,
        rendered_body: null,
        content_version: campanha.content_version,
        variables: proveniencia(contato, row, negocioId, etapaDestino, null),
      });
      resumo.excluidos[motivo] = (resumo.excluidos[motivo] ?? 0) + 1;
    };

    // ═══ O NEGÓCIO JÁ FOI FECHADO ALGUMA VEZ — o salto de DOIS arrastos ═══
    //
    // O veto de origem, lá em cima, fecha UM arrasto («Ganho» → etapa armada).
    // Não fecha dois, e dois é triagem normal: «Ganho» → «Novo lead» (aquele
    // veto pega, mas `fn_crm_lead_close_on_stage` APAGA `closed_at` e
    // `lost_from_stage_id` no mesmo UPDATE) e depois «Novo lead» → etapa armada,
    // onde a origem é aberta, o status é `open` e nada no negócio lembra do
    // fechamento. E no funil `novo_negocio` nem reabertura existe: nasce um card
    // NOVO sem herdar marca nenhuma. Os TRÊS sinais que respondem a isso estão em
    // `carregaNegocio`.
    //
    // ⚠️ VIRA LINHA, e isso é o ponto. Antes ele só contava e voltava, e num modo
    // de público SEM LISTA o operador não tinha outro jeito de ver o veto comendo
    // a base — o único rastro era um número no `detail` do `event_log`, que
    // ninguém abre. Como linha `skipped`, ela aparece na contagem de "ficaram de
    // fora", com o motivo por pessoa, pela mesma doutrina da preparação. Por isso
    // o veto desceu para DENTRO do laço: linha é por campanha, e escrevê-la antes
    // do corte de `started_at` registraria exclusão numa campanha que nem começou.
    //
    // O veto NÃO EXPIRA, e vale para ganho E para perda. Ganho: quem comprou é
    // cliente, e campanha contínua é primeiro contato. Perda: é o mesmo
    // argumento do veto de origem logo acima — quem disse não em março não quer
    // a abordagem fria de outubro, e arrastar (ou retomar) o card é triagem
    // interna, não consentimento. Em nenhum dos dois casos o sinal distingue
    // ganho de perda, e nem precisa: a resposta é a mesma. Quem quiser falar com
    // essas pessoas usa o modo LISTA, que o operador revisa pessoa por pessoa.
    if (negocio.jaFoiFechado) {
      await excluir("negocio_ja_fechado");
      resumo.ja_foi_fechado++;
      continue;
    }

    // ─── Os vetos por PESSOA, os mesmos da preparação ───
    const pessoal = motivoParaExcluir(contato);
    if (pessoal) {
      await excluir(pessoal);
      continue;
    }
    const endereco = contato.telefone!.trim();
    if (await deps.db.estaSuprimido(row.organization_id, endereco)) {
      await excluir("suprimido");
      continue;
    }
    // Quem outra campanha JÁ ABORDOU, ou está A CAMINHO de abordar, não entra:
    // além de queimar o contato, a segunda mensagem não mede a segunda copy —
    // mede alguém que já foi abordado. São dois critérios (recebeu na janela de
    // `DIAS_SEM_REPETIR_A_CADENCIA`, OU está na fila ativa de campanha não
    // terminal) e a doutrina de por que não são um está em
    // `entrada-por-etapa.db.ts`. Linha excluída não conta: não recebeu nada.
    if (await deps.db.estaEmOutraCampanha(row.organization_id, contato.contactId, campanha.id)) {
      await excluir("ja_em_campanha");
      continue;
    }

    // ─── O TETO DO DIA, cobrado no ALISTAMENTO e não só no envio ───
    //
    // Sem isto, 5.000 chegadas num dia com teto de 50 gravariam 5.000 pendentes:
    // a campanha mandaria 50 por dia e a última pessoa receberia a abordagem
    // cem dias depois de ter entrado na etapa — uma mensagem de primeiro contato
    // disparada por um fato de um trimestre atrás. Com o teto aqui, a fila fica
    // limitada a cerca de um dia, e o teto volta a ser o que o operador leu na
    // tela: quantas pessoas NOVAS esta campanha aborda por dia.
    //
    // É limitador de RITMO, não reserva transacional: duas chegadas no mesmo
    // instante podem passar juntas e estourar o teto em uma ou duas linhas. O
    // teto duro dos ENVIOS continua sendo `podeMandarAgora`, que conta `sent_at`
    // — e é ele que decide quantas mensagens saem.
    //
    // ⚠️ TETO NULO NÃO ALISTA (P1-1 do @Cassio_SecRev). A primeira versão deixava
    // o nulo cair fora do `if` e alistava sem conta — falha ABERTA, no lugar em
    // que ela custa mais caro. O estado é inalcançável pelo produto (o CHECK
    // `campaigns_entrada_continua_contida` o recusa fora do rascunho), mas o
    // CHECK é a defesa ÚNICA e mora no banco: numa VPS cujo baseline não foi
    // reaplicado, ou depois de alguém derrubar a constraint num conserto manual,
    // o comportamento não seria "para de abordar" — seria "aborda sem teto, para
    // sempre". Contenção que aceita branco não é contenção, e é o que o
    // cabeçalho deste arquivo promete.
    if (campanha.teto_diario === null) {
      resumo.sem_teto++;
      continue;
    }
    const fuso = await deps.db.fusoDaOrganizacao(row.organization_id);
    const jaHoje = await deps.db.alistadosDesde(
      row.organization_id,
      campanha.id,
      dayStartInTz(new Date(eventoEm), fuso),
    );
    if (jaHoje >= campanha.teto_diario) {
      resumo.teto_do_dia++;
      continue;
    }

    // ─── O texto, congelado AQUI (como na preparação) ───
    // A saudação NÃO é resolvida: ela é da hora do envio, e o token fica no
    // corpo para `rodada.ts` trocar. A semente é o `contact_id`, a mesma do modo
    // lista e do envio de teste — a pessoa recebe a variante que o operador viu.
    const render = renderizarVariacao({
      variantes: variantesDaCampanha(campanha.message_body, campanha.message_variants),
      semente: contato.contactId,
      valores: { nome: contato.nome },
    });
    if (render.faltando.length > 0) {
      await excluir("variavel_ausente");
      continue;
    }
    // Motivo próprio, como em `classificarAudiencia`: aqui não falta dado do
    // contato — o texto resolveu para nada (`{Olá|}` em metade das sementes), e
    // mensagem em branco sai pelo WhatsApp como sai qualquer outra.
    if (render.vazio || render.texto.trim() === "") {
      await excluir("texto_vazio");
      continue;
    }

    const alistou = await deps.db.alista({
      organization_id: row.organization_id,
      campaign_id: campanha.id,
      contact_id: contato.contactId,
      recipient_address: endereco,
      status: "pending",
      eligibility_status: "eligible",
      exclusion_reason: null,
      rendered_body: render.texto,
      content_version: campanha.content_version,
      variables: proveniencia(contato, row, negocioId, etapaDestino, render.varianteIndex),
    });
    if (alistou) resumo.alistados++;
    else resumo.ja_na_campanha++;
  }

  return resumo;
}

/**
 * A PROVENIÊNCIA, em `campaign_recipients.variables` (jsonb, sem coluna nova).
 *
 * É o que responde "por que esta pessoa recebeu?" numa campanha sem lista para
 * conferir: o negócio, a etapa de destino e a linha do `event_log` que disparou.
 * No modo lista a resposta estava no recorte congelado; aqui ela precisa estar na
 * própria linha. `nome` e `variante_index` seguem no formato da preparação, que é
 * o que a tela já lê.
 */
function proveniencia(
  contato: ContatoDoAlvo,
  row: EventRow,
  negocioId: string,
  etapaDestino: string,
  varianteIndex: number | null,
): Record<string, unknown> {
  return {
    nome: contato.nome,
    variante_index: varianteIndex ?? 0,
    entrada: "etapa",
    lead_id: negocioId,
    from_stage_id: textoOuNulo(row.payload.from_stage_id),
    to_stage_id: etapaDestino,
    event_log_id: row.id,
  };
}
