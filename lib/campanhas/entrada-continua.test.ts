import { describe, expect, it } from "vitest";

import {
  ehEntradaContinua,
  filtroDaEtapaDeEntrada,
  problemaNaEntradaContinua,
  type EntradaDaCampanha,
} from "./entrada-continua";

/**
 * O gate do modo CONTÍNUO (migration 9038).
 *
 * Duas coisas se cobram aqui, e a primeira é a que mais importa: campanha em
 * modo LISTA não é afetada por NADA deste módulo. O resto é a contenção — teto
 * do dia e janela —, que no contínuo é a única coisa entre a campanha e um
 * número indefinido de estranhos recebendo mensagem de madrugada.
 */
const CONTINUA: EntradaDaCampanha = {
  entrada_continua: true,
  entrada_etapa_id: "11111111-1111-4111-8111-111111111111",
  pipeline_id: "22222222-2222-4222-8222-222222222222",
  teto_diario: 40,
  janela_inicio_hora: 9,
  janela_fim_hora: 18,
};

describe("entrada contínua: o modo lista não muda", () => {
  it("campanha de lista nunca tem problema de entrada contínua, nem com tudo em branco", () => {
    const lista: EntradaDaCampanha = {
      entrada_continua: false,
      entrada_etapa_id: null,
      pipeline_id: null,
      teto_diario: null,
      janela_inicio_hora: null,
      janela_fim_hora: null,
    };
    expect(ehEntradaContinua(lista)).toBe(false);
    expect(problemaNaEntradaContinua(lista)).toBeNull();
  });
});

describe("entrada contínua: a contenção é exigida", () => {
  it("passa com funil, etapa, teto e janela", () => {
    expect(problemaNaEntradaContinua(CONTINUA)).toBeNull();
  });

  it("sem funil, recusa", () => {
    expect(problemaNaEntradaContinua({ ...CONTINUA, pipeline_id: null })).toMatch(/funil/i);
  });

  it("sem etapa, recusa — e a frase diz que a etapa pode ter sido apagada", () => {
    // Não é só configuração incompleta: é o estado em que a campanha cai quando
    // alguém apaga a etapa (a FK da 9038 é `on delete set null`). A frase tem de
    // explicar o silêncio, senão o operador procura um defeito nosso.
    const r = problemaNaEntradaContinua({ ...CONTINUA, entrada_etapa_id: null });
    expect(r).toMatch(/etapa/i);
    expect(r).toMatch(/apagada/i);
  });

  it("sem teto do dia, recusa", () => {
    expect(problemaNaEntradaContinua({ ...CONTINUA, teto_diario: null })).toMatch(/dia/i);
  });

  it("sem janela, recusa — nas duas metades", () => {
    expect(problemaNaEntradaContinua({ ...CONTINUA, janela_inicio_hora: null })).toMatch(/horário/i);
    expect(problemaNaEntradaContinua({ ...CONTINUA, janela_fim_hora: null })).toMatch(/horário/i);
  });

  it("teto ZERO não existe, mas teto 1 não é 'ausente'", () => {
    // `0` é falsy em JavaScript, e um gate escrito com `!c.teto_diario` trataria
    // teto 1 como presente e teto 0 como ausente — mas o CHECK do banco e o Zod
    // já recusam 0, então o que este caso protege é o oposto: um teto legítimo e
    // pequeno não pode ser lido como falta.
    expect(problemaNaEntradaContinua({ ...CONTINUA, teto_diario: 1 })).toBeNull();
    // Meia-noite é hora válida, e `0` é falsy: o gate compara com `null`.
    expect(problemaNaEntradaContinua({ ...CONTINUA, janela_inicio_hora: 0 })).toBeNull();
  });
});

describe("entrada contínua: o recorte da prévia", () => {
  it("é o funil e a etapa, só com negócio ABERTO", () => {
    const f = filtroDaEtapaDeEntrada(CONTINUA);
    expect(f.funis).toEqual([CONTINUA.pipeline_id]);
    expect(f.etapas).toEqual([CONTINUA.entrada_etapa_id]);
    // Ganho e perdido fora: a etapa guarda card fechado quando alguém o arrasta
    // de volta, e abordar quem já comprou com a copy de primeiro contato é o
    // erro que não se desfaz.
    expect(f.situacoes_do_negocio).toEqual(["open"]);
  });

  it("não carrega critério de contato nenhum — o público é a etapa", () => {
    // Cruzar o gatilho com etiquetas e silêncio criaria um recorte que o
    // operador não vê em lugar nenhum e que muda sob ele a cada chegada.
    const f = filtroDaEtapaDeEntrada(CONTINUA);
    expect(f.com_alguma_tag).toEqual([]);
    expect(f.sem_tags).toEqual([]);
    expect(f.sem_interacao_ha_dias).toBeNull();
    expect(f.incluir_contatos).toEqual([]);
  });
});
