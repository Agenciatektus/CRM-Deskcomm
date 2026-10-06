import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { ORIGEM_DO_PASSO_DE_REGUA } from "@/lib/leads/movimento-em-regua";

import {
  EVENTO_DE_ETAPA,
  alistarPorEtapa,
  type CampanhaArmada,
  type ContatoDoAlvo,
  type EntradaPorEtapaDb,
  type LinhaDoAlistamento,
} from "./entrada-por-etapa";

/**
 * O GATILHO DA CAMPANHA CONTÍNUA (migration 9038) — contra um DB de mentira,
 * porque a decisão é o que importa.
 *
 * O que se cobra aqui é, em ordem de custo de errar:
 *
 *   1. ninguém é abordado por engano — veto por pessoa, supressão, outra
 *      campanha, negócio fechado, evento anterior ao Iniciar;
 *   2. a 1ª mensagem nasce CONGELADA, com a saudação ainda como token (quem a
 *      resolve é o envio, no fuso do canal);
 *   3. o teto do dia morde no ALISTAMENTO, não só no envio — senão a fila
 *      acumula meses e a abordagem sai disparada por um fato antigo;
 *   4. 23505 é caminho normal: o card que entra e sai da etapa rende UMA
 *      abordagem.
 */
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ETAPA = "11111111-1111-4111-8111-111111111111";
const NEGOCIO = "33333333-3333-4333-8333-333333333333";
const CONTATO = "44444444-4444-4444-8444-444444444444";
const CAMPANHA = "55555555-5555-4555-8555-555555555555";

const INICIO = "2026-10-06T12:00:00.000Z";
const DEPOIS = "2026-10-06T12:30:00.000Z";
const ANTES = "2026-10-06T11:00:00.000Z";

function evento(parcial: Partial<EventRow> = {}): EventRow {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    organization_id: ORG,
    event_type: EVENTO_DE_ETAPA,
    entity_kind: "crm_lead",
    entity_id: NEGOCIO,
    payload: { to_stage_id: ETAPA, from_stage_id: "outra" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
    created_at: DEPOIS,
    ...parcial,
  };
}

function campanha(parcial: Partial<CampanhaArmada> = {}): CampanhaArmada {
  return {
    id: CAMPANHA,
    organization_id: ORG,
    message_body: "Oi {{nome}}, {{saudacao}}!",
    message_variants: [],
    content_version: 3,
    teto_diario: 10,
    started_at: INICIO,
    ...parcial,
  };
}

function contato(parcial: Partial<ContatoDoAlvo> = {}): ContatoDoAlvo {
  return {
    contactId: CONTATO,
    nome: "Marina",
    telefone: "+5548999990000",
    bloqueado: false,
    anonimizado: false,
    recusouMarketing: false,
    ...parcial,
  };
}

interface Cenario {
  armadas?: CampanhaArmada[];
  /** `true` = a etapa (de origem ou de destino) fecha o negócio. */
  etapaDeFechamento?: boolean;
  negocio?: { contactId: string | null; aberto: boolean } | null;
  alvo?: ContatoDoAlvo | null;
  emOutraCampanha?: boolean;
  suprimido?: boolean;
  jaHoje?: number;
  /** `false` força o 23505 do `campaign_recipients_contato_unico`. */
  aceitaInsert?: boolean;
}

function fakeDb(c: Cenario = {}): { db: EntradaPorEtapaDb; gravadas: LinhaDoAlistamento[] } {
  const gravadas: LinhaDoAlistamento[] = [];
  const db: EntradaPorEtapaDb = {
    carregaCampanhasArmadas: async () => c.armadas ?? [campanha()],
    ehEtapaDeFechamento: async () => c.etapaDeFechamento ?? false,
    carregaNegocio: async () =>
      c.negocio === undefined ? { contactId: CONTATO, aberto: true } : c.negocio,
    carregaContato: async () => (c.alvo === undefined ? contato() : c.alvo),
    estaEmOutraCampanha: async () => c.emOutraCampanha ?? false,
    estaSuprimido: async () => c.suprimido ?? false,
    alistadosDesde: async () => c.jaHoje ?? 0,
    alista: async (linha) => {
      gravadas.push(linha);
      return c.aceitaInsert ?? true;
    },
    fusoDaOrganizacao: async () => "America/Sao_Paulo",
  };
  return { db, gravadas };
}

const deps = (db: EntradaPorEtapaDb) => ({ db, clock: () => new Date(DEPOIS) });

describe("entrada por etapa: o caminho que alista", () => {
  it("alista com o texto congelado e a saudação AINDA como token", async () => {
    const { db, gravadas } = fakeDb();
    const r = await alistarPorEtapa(deps(db), evento());

    expect(r.matched).toBe(true);
    expect(r.alistados).toBe(1);
    expect(gravadas).toHaveLength(1);
    const linha = gravadas[0]!;
    expect(linha.status).toBe("pending");
    expect(linha.eligibility_status).toBe("eligible");
    expect(linha.exclusion_reason).toBeNull();
    expect(linha.recipient_address).toBe("+5548999990000");
    // O nome entra agora; a saudação fica para o envio, no fuso do canal.
    // Resolvê-la aqui produziria "bom dia" numa mensagem enviada à tarde.
    expect(linha.rendered_body).toContain("Marina");
    expect(linha.rendered_body).toContain("{{saudacao}}");
    // A versão do conteúdo vai junto: é por ela que se sabe se a mensagem
    // congelada é a mensagem de hoje.
    expect(linha.content_version).toBe(3);
  });

  it("grava a proveniência: negócio, etapa e a linha do event_log", async () => {
    // Num modo de público sem lista para conferir, é esta a única resposta
    // possível para "por que esta pessoa recebeu?".
    const { db, gravadas } = fakeDb();
    await alistarPorEtapa(deps(db), evento());
    expect(gravadas[0]!.variables).toMatchObject({
      entrada: "etapa",
      lead_id: NEGOCIO,
      to_stage_id: ETAPA,
      from_stage_id: "outra",
      event_log_id: "66666666-6666-4666-8666-666666666666",
      nome: "Marina",
    });
  });

  it("23505 no insert é caminho normal — o card que vai e volta rende UMA abordagem", async () => {
    const { db } = fakeDb({ aceitaInsert: false });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.ja_na_campanha).toBe(1);
  });
});

describe("entrada por etapa: quem NÃO é abordado", () => {
  it("evento que não é mudança de etapa não faz nada", async () => {
    const { db, gravadas } = fakeDb();
    const r = await alistarPorEtapa(deps(db), evento({ event_type: "message.received" }));
    expect(r.matched).toBe(false);
    expect(gravadas).toHaveLength(0);
  });

  it("sem etapa de destino, o evento não descreve o fato esperado", async () => {
    const { db } = fakeDb();
    const r = await alistarPorEtapa(deps(db), evento({ payload: {} }));
    expect(r.matched).toBe(false);
  });

  it("nenhuma campanha armada sai antes de consultar o negócio", async () => {
    // A esmagadora maioria dos cards arrastados não tem campanha contínua
    // nenhuma: uma ida ao banco por arrasto seria custo puro no caminho quente
    // do CRM.
    let perguntouDoNegocio = false;
    const { db } = fakeDb({ armadas: [] });
    const r = await alistarPorEtapa(
      deps({
        ...db,
        carregaNegocio: async () => {
          perguntouDoNegocio = true;
          return { contactId: CONTATO, aberto: true };
        },
      }),
      evento(),
    );
    expect(r.campanhas_armadas).toBe(0);
    expect(perguntouDoNegocio).toBe(false);
  });

  it("negócio FECHADO não é abordado, e nenhuma linha é gravada", async () => {
    // A etapa também guarda card ganho e perdido quando alguém o arrasta de
    // volta. Abordar quem já comprou — ou quem já disse não — com a copy de
    // primeiro contato é o erro que não se desfaz.
    const { db, gravadas } = fakeDb({ negocio: { contactId: CONTATO, aberto: false } });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.sem_alvo).toBe(1);
    expect(gravadas).toHaveLength(0);
  });

  it("negócio sem contato não tem a quem escrever", async () => {
    const { db } = fakeDb({ negocio: { contactId: null, aberto: true } });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.sem_alvo).toBe(1);
  });

  it("evento ANTERIOR ao Iniciar não entra — nada retroativo", async () => {
    // Armar o gatilho não pode abordar o estoque da etapa: quem já estava lá é
    // assunto do modo lista, que passa pela conferência do operador. E
    // `started_at` é reescrito no Retomar, então a chegada ocorrida durante a
    // pausa também fica fora.
    const { db, gravadas } = fakeDb();
    const r = await alistarPorEtapa(deps(db), evento({ created_at: ANTES }));
    expect(r.alistados).toBe(0);
    expect(r.anterior_ao_inicio).toBe(1);
    expect(gravadas).toHaveLength(0);
  });

  it("evento no INSTANTE do Iniciar entra — o corte é 'antes', não 'até'", async () => {
    const { db } = fakeDb({ armadas: [campanha({ started_at: DEPOIS })] });
    const r = await alistarPorEtapa(deps(db), evento({ created_at: DEPOIS }));
    expect(r.alistados).toBe(1);
  });

  it("campanha running SEM started_at não arma (falha fechada)", async () => {
    const { db } = fakeDb({ armadas: [campanha({ started_at: null })] });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.anterior_ao_inicio).toBe(1);
  });

  it.each([
    ["bloqueado", { bloqueado: true }, "opt_out"],
    ["anonimizado", { anonimizado: true }, "anonimizado"],
    ["recusou marketing", { recusouMarketing: true }, "recusou_marketing"],
    ["sem telefone", { telefone: null }, "sem_telefone"],
    ["telefone fora do formato", { telefone: "48999990000" }, "telefone_invalido"],
  ])("%s vira linha EXCLUÍDA, com o motivo e sem telefone gravado", async (_nome, mudanca, motivo) => {
    const { db, gravadas } = fakeDb({ alvo: contato(mudanca as Partial<ContatoDoAlvo>) });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.excluidos[motivo as keyof typeof r.excluidos]).toBe(1);
    // A linha existe (é o que responde "entrou na etapa e não foi abordada;
    // por quê?"), mas nasce `skipped`, sem corpo e sem telefone: PII sem
    // finalidade não se guarda.
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]!.status).toBe("skipped");
    expect(gravadas[0]!.rendered_body).toBeNull();
    expect(gravadas[0]!.recipient_address).toBeNull();
  });

  it("telefone na lista de exclusão da operação é suprimido", async () => {
    const { db, gravadas } = fakeDb({ suprimido: true });
    await alistarPorEtapa(deps(db), evento());
    expect(gravadas[0]!.exclusion_reason).toBe("suprimido");
  });

  it("comprometido com outra campanha viva fica de fora", async () => {
    const { db, gravadas } = fakeDb({ emOutraCampanha: true });
    await alistarPorEtapa(deps(db), evento());
    expect(gravadas[0]!.exclusion_reason).toBe("ja_em_campanha");
  });

  it("variável que falta no cadastro barra o envio, com motivo próprio", async () => {
    const { db, gravadas } = fakeDb({ alvo: contato({ nome: null }) });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.excluidos.variavel_ausente).toBe(1);
    expect(gravadas[0]!.status).toBe("skipped");
  });

  it("texto que resolve para NADA tem motivo próprio, não 'falta um dado'", async () => {
    // `{Olá|}` é spintax válido e não usa variável nenhuma: sem este motivo
    // separado, a pessoa passaria como elegível com corpo em branco — e
    // mensagem vazia sai pelo WhatsApp como sai qualquer outra.
    const { db, gravadas } = fakeDb({ armadas: [campanha({ message_body: "{|}" })] });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.excluidos.texto_vazio).toBe(1);
    expect(gravadas[0]!.exclusion_reason).toBe("texto_vazio");
  });
});

describe("entrada por etapa: o teto do dia é contenção, não enfeite", () => {
  it("teto já gasto não alista e NÃO grava nada", async () => {
    // Nem como excluído: a pessoa não foi vetada, ela só chegou num dia cheio.
    // Gravar `skipped` aqui queimaria o `campaign_recipients_contato_unico` e a
    // deixaria fora da campanha para sempre.
    const { db, gravadas } = fakeDb({ jaHoje: 10 });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.teto_do_dia).toBe(1);
    expect(gravadas).toHaveLength(0);
  });

  it("abaixo do teto, alista", async () => {
    const { db } = fakeDb({ jaHoje: 9 });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(1);
  });

  it("o teto é cobrado DEPOIS dos vetos — quem é vetado não gasta vaga", async () => {
    // A mesma ordem de `inscreverPorGatilho` ("reserva depois da avaliação").
    // Invertida, uma etapa cheia de bloqueados esgotaria o teto do dia de uma
    // campanha que não abordou ninguém.
    let perguntouDoTeto = false;
    const { db } = fakeDb({ alvo: contato({ bloqueado: true }) });
    await alistarPorEtapa(
      deps({
        ...db,
        alistadosDesde: async () => {
          perguntouDoTeto = true;
          return 0;
        },
      }),
      evento(),
    );
    expect(perguntouDoTeto).toBe(false);
  });

  it("TETO NULO NÃO ALISTA — contenção que aceita branco não é contenção", async () => {
    // P1-1 do @Cassio_SecRev. A primeira versão deixava o nulo cair fora do `if`
    // e alistava sem conta: falha ABERTA no lugar mais caro. O estado é
    // inalcançável pelo produto (o CHECK `campaigns_entrada_continua_contida` o
    // recusa fora do rascunho), mas o CHECK é defesa Única e mora no banco — numa
    // VPS cujo baseline não foi reaplicado, ou depois de alguém derrubar a
    // constraint num conserto manual, "aborda sem teto, para sempre" seria o
    // comportamento.
    const { db, gravadas } = fakeDb({ armadas: [campanha({ teto_diario: null })] });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.sem_teto).toBe(1);
    expect(gravadas).toHaveLength(0);
  });

  it("com teto nulo não consulta o dia nem o fuso — recusa antes", async () => {
    let perguntou = false;
    const { db } = fakeDb({ armadas: [campanha({ teto_diario: null })] });
    const r = await alistarPorEtapa(
      deps({
        ...db,
        alistadosDesde: async () => {
          perguntou = true;
          return 0;
        },
      }),
      evento(),
    );
    expect(r.sem_teto).toBe(1);
    expect(perguntou).toBe(false);
  });
});

describe("entrada por etapa: o card que VOLTA de ganho ou de perda", () => {
  it("vindo de etapa de fechamento, ninguém é abordado e nada é gravado", async () => {
    // P1-2 do @Cassio_SecRev, e é o furo que o veto `aberto` NÃO cobria:
    // `fn_crm_lead_close_on_stage` REABRE o negócio quando `old.status in
    // ('won','lost')` e a etapa nova não fecha. O cliente que comprou em março,
    // cujo card alguém arrasta de «Ganho» para «Novo lead» em outubro, chega
    // aqui com `aberto = true` e passaria por todos os vetos — recebendo a
    // mensagem de PRIMEIRO contato.
    const { db, gravadas } = fakeDb({ etapaDeFechamento: true });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.alistados).toBe(0);
    expect(r.veio_de_fechamento).toBe(1);
    expect(gravadas).toHaveLength(0);
  });

  it("o veto lê a etapa de ORIGEM, e sai antes de consultar o negócio", async () => {
    // Ler o negócio não ajudaria: ele já foi reaberto pelo gatilho do banco no
    // mesmo UPDATE que emitiu o evento.
    let perguntouDoNegocio = false;
    const { db } = fakeDb({ etapaDeFechamento: true });
    const etapasLidas: string[] = [];
    await alistarPorEtapa(
      deps({
        ...db,
        ehEtapaDeFechamento: async (_org, stageId) => {
          etapasLidas.push(stageId);
          return true;
        },
        carregaNegocio: async () => {
          perguntouDoNegocio = true;
          return { contactId: CONTATO, aberto: true };
        },
      }),
      evento({ payload: { to_stage_id: ETAPA, from_stage_id: "etapa-de-ganho" } }),
    );
    expect(etapasLidas).toEqual(["etapa-de-ganho"]);
    expect(perguntouDoNegocio).toBe(false);
  });

  it("sem etapa de origem (card novo, primeira etapa) o veto não se aplica", async () => {
    const { db } = fakeDb();
    const r = await alistarPorEtapa(deps(db), evento({ payload: { to_stage_id: ETAPA } }));
    expect(r.veio_de_fechamento).toBe(0);
    expect(r.alistados).toBe(1);
  });
});

describe("entrada por etapa: o movimento da própria régua não realimenta o gatilho", () => {
  it("evento marcado como passo de régua é ignorado, sem tocar o banco", async () => {
    // P2-4. O passo `mover_etapa` da fatia 2 move o card pelo `moveLeadHandler`,
    // que emite `lead.stage_changed` como qualquer movimento. Uma régua que mova
    // para a etapa armada fechava o laço abordagem → passo → alistamento →
    // abordagem, e ele só terminava por EFEITO COLATERAL (o unique da campanha e
    // o veto "já em campanha" lendo linha excluída — que o P2-1 estreitou).
    let consultou = false;
    const { db, gravadas } = fakeDb();
    const r = await alistarPorEtapa(
      deps({
        ...db,
        carregaCampanhasArmadas: async () => {
          consultou = true;
          return [campanha()];
        },
      }),
      evento({ metadata: { via: ORIGEM_DO_PASSO_DE_REGUA } }),
    );
    expect(r.matched).toBe(true);
    expect(r.passo_de_regua).toBe(1);
    expect(r.alistados).toBe(0);
    expect(gravadas).toHaveLength(0);
    expect(consultou, "sai antes de consultar campanha armada").toBe(false);
  });

  it("movimento humano (sem marca) segue alistando", async () => {
    const { db } = fakeDb();
    const r = await alistarPorEtapa(deps(db), evento({ metadata: { request_id: "req-1" } }));
    expect(r.passo_de_regua).toBe(0);
    expect(r.alistados).toBe(1);
  });
});

describe("entrada por etapa: duas campanhas armadas na mesma etapa", () => {
  it("cada uma decide por si", async () => {
    const outra = campanha({
      id: "77777777-7777-4777-8777-777777777777",
      started_at: "2026-10-06T13:00:00.000Z",
    });
    // A segunda começou DEPOIS do evento: ela não alista, a primeira sim.
    const { db, gravadas } = fakeDb({ armadas: [campanha(), outra] });
    const r = await alistarPorEtapa(deps(db), evento());
    expect(r.campanhas_armadas).toBe(2);
    expect(r.alistados).toBe(1);
    expect(r.anterior_ao_inicio).toBe(1);
    expect(gravadas.map((l) => l.campaign_id)).toEqual([CAMPANHA]);
  });
});
