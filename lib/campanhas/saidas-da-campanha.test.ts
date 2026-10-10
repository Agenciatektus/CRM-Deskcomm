import { describe, expect, it } from "vitest";

import { SAIDAS_PADRAO, motivoDeSaida, saidasDe } from "@/lib/cadencia/saidas";

import {
  MENSAGEM_SAIDAS_ILEGIVEIS,
  SAIDAS_DA_CAMPANHA_PADRAO,
  ehObjetoDeSaidas,
  lerSaidasDaCampanha,
  problemaNasSaidas,
  saidasForamEscolhidas,
  saidasParaATela,
} from "./saidas-da-campanha";

/**
 * O PADRÃO NÃO MUDOU — é a asserção mais importante desta fatia.
 *
 * Toda campanha que existe hoje tem `saidas` nula, então o que ela publica é o
 * que `lerSaidasDaCampanha(null)` devolve. O literal abaixo está copiado À MÃO
 * do que `politicaDaRegua` tinha escrito no código antes da 9046: comparar com a
 * constante do produto provaria a constante do produto, e o dia em que alguém
 * mudasse `SAIDAS_PADRAO` na cadência o teste continuaria verde enquanto o
 * comportamento de centenas de campanhas mudava em silêncio.
 */
const LITERAL_DE_ANTES_DA_9046 = {
  etiquetas: [],
  etapas: [],
  ao_fechar: true,
  humano_assumir: true,
};

describe("lerSaidasDaCampanha", () => {
  it("nula devolve o literal que a campanha publicava antes da 9046", () => {
    const lido = lerSaidasDaCampanha(null);
    expect(lido.ok).toBe(true);
    expect(lido.ok && lido.saidas).toEqual(LITERAL_DE_ANTES_DA_9046);
  });

  it("ausente (coluna que a consulta não trouxe) também devolve o padrão", () => {
    const lido = lerSaidasDaCampanha(undefined);
    expect(lido.ok && lido.saidas).toEqual(LITERAL_DE_ANTES_DA_9046);
  });

  it("o padrão da campanha é o MESMO da cadência, e os dois são o literal", () => {
    // Uma cópia própria do padrão divergiria no primeiro ajuste, e divergir
    // neste valor significa régua de campanha parando por um critério e régua de
    // cadência por outro, com a mesma tela.
    expect(SAIDAS_DA_CAMPANHA_PADRAO).toEqual(LITERAL_DE_ANTES_DA_9046);
    expect(SAIDAS_DA_CAMPANHA_PADRAO).toEqual(SAIDAS_PADRAO);
  });

  it("objeto vazio é o padrão: o Zod preenche cada campo por omissão", () => {
    expect(lerSaidasDaCampanha({}).ok).toBe(true);
    const lido = lerSaidasDaCampanha({});
    expect(lido.ok && lido.saidas).toEqual(LITERAL_DE_ANTES_DA_9046);
  });

  it("lê a escolha do operador inteira", () => {
    const etapa = "88888888-8888-4888-8888-888888888888";
    const lido = lerSaidasDaCampanha({
      etiquetas: ["Reunião agendada", "Não perturbe"],
      etapas: [etapa],
      ao_fechar: false,
      humano_assumir: false,
    });
    expect(lido).toEqual({
      ok: true,
      saidas: {
        etiquetas: ["Reunião agendada", "Não perturbe"],
        etapas: [etapa],
        ao_fechar: false,
        humano_assumir: false,
      },
    });
  });

  it("RECUSA em vez de cair no padrão — a direção em que esta fatia erra", () => {
    // Cair no padrão perderia justamente a etapa e a etiqueta escolhidas, e a
    // régua voltaria a mandar abordagem de prospecção para quem o operador já
    // tinha mandado parar de receber. Mensagem enviada não se desfaz; régua que
    // não publica se conserta em dez segundos.
    for (const ilegivel of [
      "pare tudo",
      [],
      [{ ao_fechar: true }],
      42,
      true,
      { ao_fechar: "sim" },
      { humano_assumir: 1 },
      { etapas: ["nao-e-uuid"] },
      { etiquetas: [""] },
      { etiquetas: "Reunião agendada" },
      // `strictObject`: campo desconhecido é recusa, e tem de ser — ele é o
      // sinal de que quem escreveu isto falava outro vocabulário, e adivinhar
      // qual metade vale é exatamente o que não se faz aqui.
      { etiquetas: [], etapas: [], ao_fechar: true, humano_assumir: true, ao_responder: false },
      // Teto do schema (20 etiquetas): lista maior é recusa, não truncamento.
      { etiquetas: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ]) {
      const lido = lerSaidasDaCampanha(ilegivel);
      expect(lido.ok, JSON.stringify(ilegivel)).toBe(false);
      expect(problemaNasSaidas(ilegivel)).toBe(MENSAGEM_SAIDAS_ILEGIVEIS);
    }
  });

  it("problemaNasSaidas é null em tudo que o motor consegue executar", () => {
    expect(problemaNasSaidas(null)).toBeNull();
    expect(problemaNasSaidas({})).toBeNull();
    expect(problemaNasSaidas({ ao_fechar: false })).toBeNull();
  });

  it("a frase da recusa diz onde consertar", () => {
    // "configuração inválida" manda o operador procurar um defeito nosso num
    // campo que ele reescolhe na tela.
    expect(MENSAGEM_SAIDAS_ILEGIVEIS).toContain("Quando a régua para");
    expect(MENSAGEM_SAIDAS_ILEGIVEIS).not.toContain("—");
  });
});

describe("o que foi lido é o que o motor executa", () => {
  it("o padrão para por negócio fechado e por humano assumindo, e por nada mais", () => {
    // Lido de volta por `saidasDe` + `motivoDeSaida`, as MESMAS funções de
    // `lib/cadencia/saidas.ts` que o handler e a reconferência antes do envio
    // usam: um `toEqual` provaria só que o objeto foi copiado.
    const politica = { saidas: SAIDAS_DA_CAMPANHA_PADRAO };
    const fatos = (over: Partial<Parameters<typeof motivoDeSaida>[1]> = {}) => ({
      lead: { stage_id: "etapa-1", status: "open", tags: [] },
      nasceuComNegocio: true,
      tagsDoContato: [],
      humanoFalouDepois: false,
      ...over,
    });
    expect(motivoDeSaida(saidasDe(politica), fatos())).toBeNull();
    expect(
      motivoDeSaida(saidasDe(politica), fatos({ lead: { stage_id: "e", status: "won", tags: [] } })),
    ).toBe("saida_negocio_ganho");
    expect(motivoDeSaida(saidasDe(politica), fatos({ humanoFalouDepois: true }))).toBe(
      "saida_humano_assumiu",
    );
    // Etiqueta nenhuma na lista: etiqueta no contato não para nada por si.
    expect(motivoDeSaida(saidasDe(politica), fatos({ tagsDoContato: ["Reunião agendada"] }))).toBeNull();
  });
});

describe("ehObjetoDeSaidas — o que `duplicarAcao` consegue copiar como está", () => {
  it("objeto sim, inclusive o ilegível: a cópia herda a recusa em vez de virar o padrão", () => {
    // Normalizar o ilegível na cópia lavaria o problema: a cópia publicaria uma
    // política mais FROUXA do que a intenção que ninguém leu, e ninguém veria.
    expect(ehObjetoDeSaidas({})).toBe(true);
    expect(ehObjetoDeSaidas({ ao_fechar: "sim" })).toBe(true);
  });

  it("array, string, número e nulo NÃO: o CHECK do banco os recusaria no INSERT", () => {
    for (const v of [[], ["x"], "pare", 42, null, undefined, true]) {
      expect(ehObjetoDeSaidas(v), JSON.stringify(v ?? null)).toBe(false);
    }
  });
});

describe("saidasParaATela — a tela é onde se conserta, então ela renderiza", () => {
  it("ilegível cai no padrão para a tela, nunca para a decisão de envio", () => {
    // Um editor que estourasse em `saidas.etiquetas.join` deixaria a campanha
    // sem caminho de volta. Quem decide o envio é a COLUNA, por
    // `problemaNasSaidas` e `politicaDaRegua` — e os dois continuam recusando.
    expect(saidasParaATela({ ao_fechar: "sim" })).toEqual(SAIDAS_DA_CAMPANHA_PADRAO);
    expect(saidasParaATela(null)).toEqual(SAIDAS_DA_CAMPANHA_PADRAO);
    expect(saidasParaATela("pare")).toEqual(SAIDAS_DA_CAMPANHA_PADRAO);
    expect(problemaNasSaidas({ ao_fechar: "sim" })).toBe(MENSAGEM_SAIDAS_ILEGIVEIS);
  });

  it("legível volta inteiro", () => {
    const escolha = { etiquetas: ["Reunião agendada"], etapas: [], ao_fechar: false, humano_assumir: true };
    expect(saidasParaATela(escolha)).toEqual(escolha);
  });

  it("o objeto devolvido é MUTÁVEL por cópia: a tela o reescreve a cada clique", () => {
    // `SAIDAS_DA_CAMPANHA_PADRAO` é congelado de propósito (ele vai para o
    // `cadence_settings` e para a tela), então o padrão da TELA tem de ser uma
    // cópia — senão o primeiro `onChange` do editor bateria num objeto selado.
    expect(Object.isFrozen(saidasParaATela(null))).toBe(false);
    expect(Object.isFrozen(SAIDAS_DA_CAMPANHA_PADRAO)).toBe(true);
  });
});

describe("saidasForamEscolhidas", () => {
  it("falso no padrão, verdadeiro em qualquer desvio", () => {
    expect(saidasForamEscolhidas(SAIDAS_DA_CAMPANHA_PADRAO)).toBe(false);
    expect(saidasForamEscolhidas({ ...SAIDAS_DA_CAMPANHA_PADRAO, ao_fechar: false })).toBe(true);
    expect(saidasForamEscolhidas({ ...SAIDAS_DA_CAMPANHA_PADRAO, humano_assumir: false })).toBe(true);
    expect(saidasForamEscolhidas({ ...SAIDAS_DA_CAMPANHA_PADRAO, etiquetas: ["x"] })).toBe(true);
    expect(saidasForamEscolhidas({ ...SAIDAS_DA_CAMPANHA_PADRAO, etapas: ["x"] })).toBe(true);
  });
});
