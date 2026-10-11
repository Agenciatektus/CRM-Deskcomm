import { describe, expect, it } from "vitest";

import { CADENCE_SETTINGS_PADRAO } from "@/lib/cadencia/settings";

import {
  avisosDeRitmoAgressivo,
  RITMO_RECOMENDADO,
  ritmoDaCampanhaNova,
  TETO_DIARIO_RECOMENDADO,
  tetoHorarioDeReferencia,
} from "./ritmo-recomendado";
import type { RitmoDaCampanha } from "./ritmo";

const SOLTO: RitmoDaCampanha = {
  intervaloSegundos: null,
  janelaInicioHora: null,
  janelaFimHora: null,
  tetoDiario: null,
  tetoHorario: null,
};

describe("RITMO_RECOMENDADO deriva da cadência, e não de número escolhido aqui", () => {
  it("o intervalo é o TETO da faixa de espaçamento da cadência", () => {
    // O máximo, e não o mínimo: a campanha promete UM intervalo, e prometer o
    // mínimo recomendaria o ritmo mais rápido que a cadência aceita.
    expect(RITMO_RECOMENDADO.intervaloSegundos).toBe(CADENCE_SETTINGS_PADRAO.espacamento.max_s);
  });

  it("o teto diário vem da OPERAÇÃO, e NÃO da cadência", () => {
    // 50 é o `max_envios_por_dia` default da prospecção do Verdash, que roda
    // com chip de cliente (LRN do rate-limit anti-ban, `.learnings/`). Decisão
    // do dono em 2026-10-10 contra os 100 da cadência.
    expect(RITMO_RECOMENDADO.tetoDiario).toBe(TETO_DIARIO_RECOMENDADO);
    expect(TETO_DIARIO_RECOMENDADO).toBe(50);
    // ⚠️ Esta linha é o alarme contra o refactor bem-intencionado: quem
    // "consertar" o número solto para a constante da cadência reprova aqui, em
    // vez de dobrar calado o volume/dia que o produto recomenda.
    expect(RITMO_RECOMENDADO.tetoDiario).not.toBe(CADENCE_SETTINGS_PADRAO.max_inscricoes_dia);
    expect(RITMO_RECOMENDADO.tetoDiario!).toBeLessThan(CADENCE_SETTINGS_PADRAO.max_inscricoes_dia);
  });

  it("a janela é a da cadência em hora cheia", () => {
    expect(RITMO_RECOMENDADO.janelaInicioHora).toBe(8);
    expect(RITMO_RECOMENDADO.janelaFimHora).toBe(18);
  });

  it("o teto horário é a RELAÇÃO entre o teto do dia e as horas da janela", () => {
    // ⚠️ Mede a relação, nunca o literal. Se o teto diário ou a janela mudarem
    // amanhã e o horário ficar cravado, é aqui que aparece — valor literal
    // deixaria os dois se separarem em silêncio.
    const horas = RITMO_RECOMENDADO.janelaFimHora! - RITMO_RECOMENDADO.janelaInicioHora!;
    expect(RITMO_RECOMENDADO.tetoHorario).toBe(Math.floor(RITMO_RECOMENDADO.tetoDiario! / horas));
    // E ele aperta mais que o intervalo sozinho permitiria (3600/120 = 30/h):
    // é o que impede o dia inteiro de sair num bloco da manhã.
    expect(RITMO_RECOMENDADO.tetoHorario!).toBeLessThan(
      3600 / RITMO_RECOMENDADO.intervaloSegundos!,
    );
    // O dia cabe na janela pelo horário: teto/h × horas não fica abaixo do dia
    // por mais que o arredondamento para baixo custa.
    expect(RITMO_RECOMENDADO.tetoHorario! * horas).toBeGreaterThan(
      RITMO_RECOMENDADO.tetoDiario! - horas,
    );
  });

  it("cabe nas faixas do CHECK da migration 0375", () => {
    expect(RITMO_RECOMENDADO.intervaloSegundos!).toBeGreaterThanOrEqual(1);
    expect(RITMO_RECOMENDADO.intervaloSegundos!).toBeLessThanOrEqual(86_400);
    expect(RITMO_RECOMENDADO.janelaInicioHora!).toBeGreaterThanOrEqual(0);
    expect(RITMO_RECOMENDADO.janelaInicioHora!).toBeLessThanOrEqual(23);
    expect(RITMO_RECOMENDADO.janelaFimHora!).toBeGreaterThan(RITMO_RECOMENDADO.janelaInicioHora!);
    expect(RITMO_RECOMENDADO.janelaFimHora!).toBeLessThanOrEqual(24);
    for (const teto of [RITMO_RECOMENDADO.tetoDiario!, RITMO_RECOMENDADO.tetoHorario!]) {
      expect(teto).toBeGreaterThanOrEqual(1);
      expect(teto).toBeLessThanOrEqual(10_000);
    }
  });

  it("é mais lento que o ritmo do NÚMERO em todas as pontas", () => {
    // `PACING_DEFAULTS`: throttle 1,2 s, janela 7h-22h, e
    // `channel_sessions.daily_message_limit` default 300. O preset da campanha
    // só sabe ir mais devagar, e o teste prova que ele de fato vai.
    expect(RITMO_RECOMENDADO.intervaloSegundos!).toBeGreaterThan(1.2);
    expect(RITMO_RECOMENDADO.janelaInicioHora!).toBeGreaterThan(7);
    expect(RITMO_RECOMENDADO.janelaFimHora!).toBeLessThan(22);
    expect(RITMO_RECOMENDADO.tetoDiario!).toBeLessThan(300);
  });
});

describe("ritmoDaCampanhaNova", () => {
  it("sem configuração da organização, é o recomendado inteiro", () => {
    expect(ritmoDaCampanhaNova(null)).toEqual(RITMO_RECOMENDADO);
    expect(ritmoDaCampanhaNova(undefined)).toEqual(RITMO_RECOMENDADO);
  });

  it("o que a organização definiu VENCE o recomendado", () => {
    const r = ritmoDaCampanhaNova({
      intervalo_segundos: 300,
      janela_inicio_hora: 10,
      janela_fim_hora: 16,
      teto_diario: 40,
      teto_horario: 5,
    });
    expect(r).toEqual({
      intervaloSegundos: 300,
      janelaInicioHora: 10,
      janelaFimHora: 16,
      tetoDiario: 40,
      tetoHorario: 5,
    });
  });

  it("campo a campo: só o nulo cai no recomendado", () => {
    const r = ritmoDaCampanhaNova({
      intervalo_segundos: null,
      janela_inicio_hora: null,
      janela_fim_hora: null,
      teto_diario: null,
      teto_horario: 2,
    });
    expect(r.intervaloSegundos).toBe(RITMO_RECOMENDADO.intervaloSegundos);
    expect(r.tetoDiario).toBe(RITMO_RECOMENDADO.tetoDiario);
    expect(r.tetoHorario).toBe(2);
  });

  it("janela declarada pela metade vem INTEIRA da organização, sem misturar", () => {
    // Misturar daria `20h-18h`, que o refine de `criarCampanhaSchema` recusa.
    const so_inicio = ritmoDaCampanhaNova({
      intervalo_segundos: null,
      janela_inicio_hora: 20,
      janela_fim_hora: null,
      teto_diario: null,
      teto_horario: null,
    });
    expect(so_inicio.janelaInicioHora).toBe(20);
    expect(so_inicio.janelaFimHora).toBeNull();

    const so_fim = ritmoDaCampanhaNova({
      intervalo_segundos: null,
      janela_inicio_hora: null,
      janela_fim_hora: 12,
      teto_diario: null,
      teto_horario: null,
    });
    expect(so_fim.janelaInicioHora).toBeNull();
    expect(so_fim.janelaFimHora).toBe(12);
  });

  it("o par que o preset produz nunca termina antes de começar", () => {
    for (const config of [
      null,
      { intervalo_segundos: null, janela_inicio_hora: null, janela_fim_hora: null, teto_diario: null, teto_horario: null },
      { intervalo_segundos: 90, janela_inicio_hora: 9, janela_fim_hora: 17, teto_diario: 30, teto_horario: 4 },
    ]) {
      const r = ritmoDaCampanhaNova(config);
      if (r.janelaInicioHora !== null && r.janelaFimHora !== null) {
        expect(r.janelaFimHora).toBeGreaterThan(r.janelaInicioHora);
      }
    }
  });
});

describe("avisosDeRitmoAgressivo", () => {
  it("ritmo todo nulo não avisa nada (nulo herda o número, que tem proteção própria)", () => {
    expect(avisosDeRitmoAgressivo(SOLTO)).toEqual([]);
  });

  it("o próprio recomendado não avisa", () => {
    expect(avisosDeRitmoAgressivo(RITMO_RECOMENDADO)).toEqual([]);
  });

  it("mais devagar que o recomendado não avisa", () => {
    expect(
      avisosDeRitmoAgressivo({
        intervaloSegundos: 600,
        janelaInicioHora: 10,
        janelaFimHora: 16,
        tetoDiario: 10,
        tetoHorario: 2,
      }),
    ).toEqual([]);
  });

  it("o teto diário do preset é 50, logo o horário dele é 5", () => {
    // Não é o valor que o teste guarda, é a consequência: o dono trocou 100 por
    // 50 e o horário acompanhou sozinho, porque ele é derivado.
    expect(RITMO_RECOMENDADO.tetoDiario).toBe(50);
    expect(RITMO_RECOMENDADO.tetoHorario).toBe(5);
  });

  it("intervalo menor avisa", () => {
    expect(avisosDeRitmoAgressivo({ ...SOLTO, intervaloSegundos: 10 })).toEqual(["intervalo"]);
  });

  it("teto diário e horário maiores avisam cada um", () => {
    expect(avisosDeRitmoAgressivo({ ...SOLTO, tetoDiario: 500 })).toEqual(["teto_diario"]);
    expect(avisosDeRitmoAgressivo({ ...SOLTO, tetoHorario: 200 })).toEqual(["teto_horario"]);
  });

  it("o preset recomendado não avisa, nem com o teto horário no fio", () => {
    // O limiar é estrito (`>`), então o próprio valor sugerido passa. Se um dia
    // virar `>=`, o produto passa a acusar o que ele acabou de preencher.
    expect(avisosDeRitmoAgressivo(RITMO_RECOMENDADO)).toEqual([]);
    expect(
      avisosDeRitmoAgressivo({ ...RITMO_RECOMENDADO, tetoHorario: RITMO_RECOMENDADO.tetoHorario! + 1 }),
    ).toEqual(["teto_horario"]);
  });

  it("JANELA ESTREITADA não vira alarme falso no teto horário", () => {
    // 50/dia em 3 horas pede 17/h só para caber. Comparado com o 5 do preset
    // isso acusaria um ritmo que expõe o número por 3h em vez de 10h.
    const estreita = {
      intervaloSegundos: RITMO_RECOMENDADO.intervaloSegundos,
      janelaInicioHora: 9,
      janelaFimHora: 12,
      tetoDiario: RITMO_RECOMENDADO.tetoDiario,
      tetoHorario: 17,
    };
    expect(tetoHorarioDeReferencia(estreita)).toBe(17);
    expect(avisosDeRitmoAgressivo(estreita)).toEqual([]);
    // Acima do que os números DELE implicam, volta a avisar.
    expect(avisosDeRitmoAgressivo({ ...estreita, tetoHorario: 30 })).toEqual(["teto_horario"]);
  });

  it("teto horário com FOLGA não avisa: quem segura é o teto do dia", () => {
    // 10/dia em 6 horas pede 2/h. Com 4/h escritos, o horário nunca chega a
    // valer, e a referência continua sendo o piso recomendado (5).
    const folgado = {
      intervaloSegundos: 600,
      janelaInicioHora: 10,
      janelaFimHora: 16,
      tetoDiario: 10,
      tetoHorario: 4,
    };
    expect(tetoHorarioDeReferencia(folgado)).toBe(RITMO_RECOMENDADO.tetoHorario);
    expect(avisosDeRitmoAgressivo(folgado)).toEqual([]);
  });

  it("sem teto diário ou sem janela, a referência horária é o piso do preset", () => {
    expect(tetoHorarioDeReferencia(SOLTO)).toBe(RITMO_RECOMENDADO.tetoHorario);
    expect(tetoHorarioDeReferencia({ ...SOLTO, tetoDiario: 50 })).toBe(
      RITMO_RECOMENDADO.tetoHorario,
    );
    expect(tetoHorarioDeReferencia({ ...SOLTO, janelaInicioHora: 8, janelaFimHora: 18 })).toBe(
      RITMO_RECOMENDADO.tetoHorario,
    );
    // Sem teto diário declarado, 20/h é 200/dia na janela recomendada: avisa.
    expect(avisosDeRitmoAgressivo({ ...SOLTO, tetoHorario: 20 })).toEqual(["teto_horario"]);
  });

  it("teto diário alto é cobrado UMA vez, no item do dia", () => {
    // 500/dia com janela de 10h implica 50/h. Os 40/h escritos não somam um
    // segundo item na lista: o problema é o teto do dia, e ele já está lá.
    expect(
      avisosDeRitmoAgressivo({
        intervaloSegundos: null,
        janelaInicioHora: 8,
        janelaFimHora: 18,
        tetoDiario: 500,
        tetoHorario: 40,
      }),
    ).toEqual(["teto_diario"]);
  });

  it("janela que começa antes OU termina depois avisa, e as duas pontas avisam uma vez", () => {
    expect(avisosDeRitmoAgressivo({ ...SOLTO, janelaInicioHora: 6, janelaFimHora: 18 })).toEqual([
      "janela",
    ]);
    expect(avisosDeRitmoAgressivo({ ...SOLTO, janelaInicioHora: 8, janelaFimHora: 22 })).toEqual([
      "janela",
    ]);
    expect(avisosDeRitmoAgressivo({ ...SOLTO, janelaInicioHora: 6, janelaFimHora: 23 })).toEqual([
      "janela",
    ]);
  });

  it("janela só pela metade não inventa aviso da outra ponta", () => {
    expect(avisosDeRitmoAgressivo({ ...SOLTO, janelaInicioHora: 9 })).toEqual([]);
    expect(avisosDeRitmoAgressivo({ ...SOLTO, janelaFimHora: 17 })).toEqual([]);
  });

  it("vários campos agressivos devolvem vários motivos, na ordem dos campos", () => {
    // 9.000/dia em 24h implica 375/h, e os 900 escritos passam disso: aqui o
    // item do horário é verdadeiro por si, não eco do teto do dia.
    expect(
      avisosDeRitmoAgressivo({
        intervaloSegundos: 5,
        janelaInicioHora: 0,
        janelaFimHora: 24,
        tetoDiario: 9_000,
        tetoHorario: 900,
      }),
    ).toEqual(["intervalo", "teto_diario", "teto_horario", "janela"]);
  });
});
