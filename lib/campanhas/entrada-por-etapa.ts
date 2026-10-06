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

  const armadas = await deps.db.carregaCampanhasArmadas(row.organization_id, etapaDestino);
  resumo.campanhas_armadas = armadas.length;
  // Sai ANTES de consultar o negócio: a esmagadora maioria das mudanças de
  // etapa não tem campanha contínua armada, e uma ida ao banco por card
  // arrastado seria custo puro no caminho quente do CRM.
  if (armadas.length === 0) return resumo;

  const negocio = await deps.db.carregaNegocio(row.organization_id, negocioId);
  // NEGÓCIO FECHADO não entra, e isto não é zelo: a etapa de um funil também
  // guarda card ganho e perdido quando alguém o arrasta de volta, e abordar com
  // a copy de primeiro contato quem já comprou — ou quem já disse não — é o erro
  // que não se desfaz. É o mesmo veto `negocio_fechado` da porta da cadência.
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
    // Comprometido com outra campanha viva não entra: além de queimar o contato,
    // a segunda mensagem não mede a segunda copy — mede alguém que já foi
    // abordado. O veto termina quando a outra campanha termina (`CAMPANHAS_VIVAS`).
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
    if (campanha.teto_diario !== null) {
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
