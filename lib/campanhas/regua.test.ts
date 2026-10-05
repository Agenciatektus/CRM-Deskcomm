import { describe, expect, it } from "vitest";

import { cadenceSettingsSchema } from "@/lib/cadencia/settings";
import { motivoDeSaida, saidasDe } from "@/lib/cadencia/saidas";
import { timelineDoGrafo, type PassoDaRegua } from "@/lib/regua/timeline";

import { grafoDaRegua, politicaDaRegua, type CampanhaComRegua } from "./regua-politica";

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
  followup_pointer_id: null,
};

describe("politicaDaRegua", () => {
  it("produz política que o Zod da cadência aceita — é o CHECK do banco que a cobra", () => {
    const r = cadenceSettingsSchema.safeParse(politicaDaRegua(base));
    expect(r.success).toBe(true);
  });

  it("usa a janela da campanha, nos sete dias da semana", () => {
    const p = politicaDaRegua({ ...base, janela_inicio_hora: 9, janela_fim_hora: 18 });
    expect(p.janela).toEqual({ start: "09:00", end: "18:00", weekdays: [0, 1, 2, 3, 4, 5, 6] });
  });

  it("traduz fim de dia 24 para 23:59, que é o que o HH:MM da cadência aceita", () => {
    // `janela_fim_hora <= 24` é válido no CHECK da campanha e "24:00" não casa o
    // regex da cadência: sem a tradução, a política seria recusada pelo Zod e
    // nenhuma régua iria ao ar para quem escolheu o dia inteiro.
    const p = politicaDaRegua({ ...base, janela_inicio_hora: 8, janela_fim_hora: 24 });
    expect(p.janela.start).toBe("08:00");
    expect(p.janela.end).toBe("23:59");
    expect(cadenceSettingsSchema.safeParse(p).success).toBe(true);
  });

  it("cai no padrão quando a janela da campanha não fecha", () => {
    const p = politicaDaRegua({ ...base, janela_inicio_hora: 20, janela_fim_hora: 8 });
    expect(p.janela.start).toBe("08:00");
    expect(p.janela.end).toBe("18:00");
  });

  it("espaçamento com min = max: a campanha promete um ritmo, não uma faixa", () => {
    const p = politicaDaRegua({ ...base, intervalo_segundos: 120 });
    expect(p.espacamento).toEqual({ min_s: 120, max_s: 120 });
  });

  it("apara o intervalo na faixa que a cadência aceita", () => {
    expect(politicaDaRegua({ ...base, intervalo_segundos: 1 }).espacamento.min_s).toBe(30);
    expect(politicaDaRegua({ ...base, intervalo_segundos: 86_400 }).espacamento.max_s).toBe(900);
  });

  it("teto de inscrições do dia sai do teto diário, aparado no teto da cadência", () => {
    expect(politicaDaRegua({ ...base, teto_diario: 40 }).max_inscricoes_dia).toBe(40);
    expect(politicaDaRegua({ ...base, teto_diario: 10_000 }).max_inscricoes_dia).toBe(500);
    expect(politicaDaRegua(base).max_inscricoes_dia).toBe(500);
  });

  it("base legal: a LIA quando há, o nome da campanha quando não há", () => {
    expect(politicaDaRegua({ ...base, lia_ref: "LIA-2026-07" }).legal_basis_ref).toContain("LIA-2026-07");
    expect(politicaDaRegua(base).legal_basis_ref).toContain("Reativação de lojistas");
    // A referência sempre leva a campanha de origem: é ela que responde "com
    // base em quê esta pessoa recebeu isto?".
    expect(politicaDaRegua(base).legal_basis_ref).toContain(base.id.slice(0, 8));
  });

  it("ao_fechar DESLIGADO: sem isso a régua morre no 1º passo de quem não tem card", () => {
    const p = politicaDaRegua(base);
    expect(p.saidas?.ao_fechar).toBe(false);
    expect(p.saidas?.humano_assumir).toBe(true);
    // A prova do motivo, pela função que decide a saída: na campanha o card só
    // nasce quando a pessoa responde, então `lead: null` é o caso NORMAL.
    const semCard = { lead: null, tagsDoContato: [], humanoFalouDepois: false };
    expect(motivoDeSaida(saidasDe(p), semCard)).toBeNull();
    // Com o padrão da cadência (`ao_fechar: true`), o mesmo fato encerraria a
    // régua dizendo que o negócio foi removido — de quem nunca teve negócio.
    expect(motivoDeSaida(saidasDe({ saidas: undefined }), semCard)).toBe("saida_negocio_removido");
  });

  it("uma pessoa assumir a conversa ainda encerra a régua", () => {
    const p = politicaDaRegua(base);
    expect(
      motivoDeSaida(saidasDe(p), { lead: null, tagsDoContato: [], humanoFalouDepois: true }),
    ).toBe("saida_humano_assumiu");
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
