import { describe, expect, it } from "vitest";

import { cadenceSettingsSchema } from "@/lib/cadencia/settings";
import { motivoDeSaida, saidasDe } from "@/lib/cadencia/saidas";
import { timelineDoGrafo, type PassoDaRegua } from "@/lib/regua/timeline";

import { grafoDaRegua, politicaDaRegua, type CampanhaComRegua } from "./regua-politica";
import { SAIDAS_DA_CAMPANHA_PADRAO } from "./saidas-da-campanha";

const base: CampanhaComRegua = {
  id: "33333333-3333-4333-8333-333333333333",
  organization_id: "44444444-4444-4444-8444-444444444444",
  name: "Reativação de lojistas",
  channel_session_id: "55555555-5555-4555-8555-555555555555",
  pipeline_id: "66666666-6666-4666-8666-666666666666",
  base_legal: "consent",
  lia_ref: null,
  intervalo_segundos: null,
  janela_inicio_hora: null,
  janela_fim_hora: null,
  teto_diario: null,
  passos: [],
  saidas: null,
  followup_pointer_id: null,
};

/**
 * A política, ou um erro ALTO.
 *
 * `politicaDaRegua` devolve `{ok, politica} | {ok:false, mensagem}` desde a 9046:
 * é essa forma que impede uma configuração de saída ilegível de virar régua
 * publicada com o padrão no lugar da escolha do operador. Nos testes de janela,
 * espaçamento e teto a leitura das saídas é sempre bem-sucedida (`saidas: null`),
 * então desembrulhar aqui mantém cada teste falando de UMA coisa — e um dia em
 * que a recusa aparecer num desses casos o `throw` diz exatamente qual é.
 */
function pol(c: CampanhaComRegua) {
  const r = politicaDaRegua(c);
  if (!r.ok) throw new Error(`política recusada: ${r.mensagem}`);
  return r.politica;
}

describe("politicaDaRegua", () => {
  it("produz política que o Zod da cadência aceita — é o CHECK do banco que a cobra", () => {
    const r = cadenceSettingsSchema.safeParse(pol(base));
    expect(r.success).toBe(true);
  });

  it("usa a janela da campanha, nos sete dias da semana", () => {
    const p = pol({ ...base, janela_inicio_hora: 9, janela_fim_hora: 18 });
    expect(p.janela).toEqual({ start: "09:00", end: "18:00", weekdays: [0, 1, 2, 3, 4, 5, 6] });
  });

  it("traduz fim de dia 24 para 23:59, que é o que o HH:MM da cadência aceita", () => {
    // `janela_fim_hora <= 24` é válido no CHECK da campanha e "24:00" não casa o
    // regex da cadência: sem a tradução, a política seria recusada pelo Zod e
    // nenhuma régua iria ao ar para quem escolheu o dia inteiro.
    const p = pol({ ...base, janela_inicio_hora: 8, janela_fim_hora: 24 });
    expect(p.janela.start).toBe("08:00");
    expect(p.janela.end).toBe("23:59");
    expect(cadenceSettingsSchema.safeParse(p).success).toBe(true);
  });

  it("cai no padrão quando a janela da campanha não fecha", () => {
    const p = pol({ ...base, janela_inicio_hora: 20, janela_fim_hora: 8 });
    expect(p.janela.start).toBe("08:00");
    expect(p.janela.end).toBe("18:00");
  });

  it("espaçamento com min = max: a campanha promete um ritmo, não uma faixa", () => {
    const p = pol({ ...base, intervalo_segundos: 120 });
    expect(p.espacamento).toEqual({ min_s: 120, max_s: 120 });
  });

  it("apara o intervalo na faixa que a cadência aceita", () => {
    expect(pol({ ...base, intervalo_segundos: 1 }).espacamento.min_s).toBe(30);
    expect(pol({ ...base, intervalo_segundos: 86_400 }).espacamento.max_s).toBe(900);
  });

  it("teto de inscrições do dia sai do teto diário, aparado no teto da cadência", () => {
    expect(pol({ ...base, teto_diario: 40 }).max_inscricoes_dia).toBe(40);
    expect(pol({ ...base, teto_diario: 10_000 }).max_inscricoes_dia).toBe(500);
    expect(pol(base).max_inscricoes_dia).toBe(500);
  });

  it("base legal: a LIA quando há, o nome da campanha quando não há", () => {
    expect(pol({ ...base, lia_ref: "LIA-2026-07" }).legal_basis_ref).toContain("LIA-2026-07");
    expect(pol(base).legal_basis_ref).toContain("Reativação de lojistas");
    // A referência sempre leva a campanha de origem: é ela que responde "com
    // base em quê esta pessoa recebeu isto?".
    expect(pol(base).legal_basis_ref).toContain(base.id.slice(0, 8));
  });

  it("NEGÓCIO PERDIDO encerra a régua — `ao_fechar` ligado, como na cadência", () => {
    // O cenário que o desligamento deixava passar: o vendedor fala com a pessoa
    // por fora, ela diz que não quer, ele marca o negócio como perdido — e os
    // passos 2, 3 e 4 continuavam saindo. `cancel_on_reply` não pega (ela não
    // respondeu no canal) e `humano_assumir` só pega se alguém falou NO canal.
    const p = pol(base);
    expect(p.saidas?.ao_fechar).toBe(true);
    expect(p.saidas?.humano_assumir).toBe(true);
    const comCard = (status: string) => ({
      lead: { stage_id: "etapa-1", status, tags: [] },
      nasceuComNegocio: true,
      tagsDoContato: [],
      humanoFalouDepois: false,
    });
    expect(motivoDeSaida(saidasDe(p), comCard("lost"))).toBe("saida_negocio_perdido");
    expect(motivoDeSaida(saidasDe(p), comCard("won"))).toBe("saida_negocio_ganho");
    expect(motivoDeSaida(saidasDe(p), comCard("open"))).toBeNull();
  });

  it("régua cujo card NÃO deu para criar segue viva, apesar do `ao_fechar`", () => {
    // É o que `nasceuComNegocio` existe para separar: sem ele, ligar `ao_fechar`
    // encerraria por "negócio removido" a régua de quem nunca teve card — e essa
    // pessoa já recebeu a 1ª mensagem.
    const p = pol(base);
    expect(
      motivoDeSaida(saidasDe(p), {
        lead: null,
        nasceuComNegocio: false,
        tagsDoContato: [],
        humanoFalouDepois: false,
      }),
    ).toBeNull();
  });

  it("uma pessoa assumir a conversa ainda encerra a régua", () => {
    const p = pol(base);
    expect(
      motivoDeSaida(saidasDe(p), {
        lead: null,
        nasceuComNegocio: false,
        tagsDoContato: [],
        humanoFalouDepois: true,
      }),
    ).toBe("saida_humano_assumiu");
  });
});

describe("as saídas que o OPERADOR escolhe (9046)", () => {
  it("campanha existente (saidas nula) publica EXATAMENTE o literal de antes da 9046", () => {
    // A prova de que esta fatia não muda campanha nenhuma. O literal abaixo é o
    // que `politicaDaRegua` tinha escrito no código até a 9046, copiado à mão de
    // propósito: comparar com a constante do produto provaria a constante do
    // produto. Se alguém mudar o padrão da cadência, este teste fica vermelho e
    // a mudança passa a ser uma decisão, não um efeito colateral.
    expect(pol(base).saidas).toEqual({
      etiquetas: [],
      etapas: [],
      ao_fechar: true,
      humano_assumir: true,
    });
    expect(SAIDAS_DA_CAMPANHA_PADRAO).toEqual(pol(base).saidas);
  });

  it("a etapa e a etiqueta escolhidas chegam ao motor, e param a régua", () => {
    const etapa = "77777777-7777-4777-8777-777777777777";
    const p = pol({
      ...base,
      saidas: { etiquetas: ["Reunião agendada"], etapas: [etapa], ao_fechar: true, humano_assumir: true },
    });
    expect(cadenceSettingsSchema.safeParse(p).success).toBe(true);
    // Lido de volta pelo MESMO `saidasDe` que o motor usa: um `toEqual` na
    // política provaria só que o objeto foi copiado.
    expect(
      motivoDeSaida(saidasDe(p), {
        lead: { stage_id: etapa, status: "open", tags: [] },
        nasceuComNegocio: true,
        tagsDoContato: [],
        humanoFalouDepois: false,
      }),
    ).toBe("saida_etapa");
    expect(
      motivoDeSaida(saidasDe(p), {
        lead: { stage_id: "outra-etapa", status: "open", tags: [] },
        nasceuComNegocio: true,
        // Caixa e espaço não importam, como no resto do produto.
        tagsDoContato: ["  reuniÃO agendada "],
        humanoFalouDepois: false,
      }),
    ).toBe("saida_etiqueta");
  });

  it("desligar «negócio ganho ou perdido» é escolha do operador, e vale", () => {
    const p = pol({
      ...base,
      saidas: { etiquetas: [], etapas: [], ao_fechar: false, humano_assumir: true },
    });
    expect(
      motivoDeSaida(saidasDe(p), {
        lead: { stage_id: "etapa-1", status: "lost", tags: [] },
        nasceuComNegocio: true,
        tagsDoContato: [],
        humanoFalouDepois: false,
      }),
    ).toBeNull();
  });

  it("SAÍDA ILEGÍVEL recusa a política em vez de cair no padrão", () => {
    // O ponto inteiro desta fatia. Cair no padrão aqui perderia a etapa que o
    // operador escolheu e a régua voltaria a falar com quem já devia ter saído —
    // e mensagem enviada não se desfaz. Então não há política: a publicação para.
    for (const ilegivel of [
      "pare tudo",
      [],
      42,
      { ao_fechar: "sim" },
      { etapas: ["nao-e-uuid"] },
      { etiquetas: [], etapas: [], ao_fechar: true, humano_assumir: true, extra: 1 },
    ]) {
      const r = politicaDaRegua({ ...base, saidas: ilegivel });
      expect(r.ok, JSON.stringify(ilegivel)).toBe(false);
    }
  });

  it("objeto VAZIO é o padrão, não recusa: é o que o Zod preenche por omissão", () => {
    expect(pol({ ...base, saidas: {} }).saidas).toEqual(SAIDAS_DA_CAMPANHA_PADRAO);
  });
});

describe("grafoDaRegua", () => {
  const passos: PassoDaRegua[] = [
    { id: "passo-1", tipo: "espera", duracaoMs: 24 * 3_600_000 },
    { id: "passo-2", tipo: "mensagem", variantes: ["Passou por aqui?"] },
    { id: "passo-3", tipo: "etiqueta", op: "add", tag: "sem-resposta" },
  ];

  it("volta como a MESMA lista: o grafo publicado é o que a tela mostra", () => {
    expect(timelineDoGrafo(grafoDaRegua(passos))).toEqual(passos);
  });

  it("começa no gatilho, onde a inscrição nasce", () => {
    // A inscrição grava `current_node_id` = nó de gatilho, e o motor avança dele
    // para o 1º passo. Se o grafo começasse na mensagem, o 2º toque sairia no
    // mesmo instante da 1ª mensagem da campanha.
    const grafo = grafoDaRegua(passos);
    expect(grafo.nodes[0]?.type).toBe("trigger");
    expect(grafo.nodes.at(-1)?.type).toBe("end");
  });
});
