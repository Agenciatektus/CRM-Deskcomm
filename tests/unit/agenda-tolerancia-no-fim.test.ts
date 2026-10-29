/**
 * Tolerância no fim do atendimento (migration 9084): no Salão Fabiana Lopes, os últimos 30
 * minutos de um procedimento já admitem a próxima cliente. Para colisão, o compromisso do
 * CRM ocupa [início, fim − tolerância); Google e bloqueio ocupam inteiro. Tolerância 0 (ou
 * ausente) é o comportamento de antes.
 */
import { describe, expect, it } from "vitest";

import { partesNoFuso } from "@/lib/agenda/fuso";
import {
  comTolerancia,
  horariosLivres,
  type JornadaDaAgenda,
  type Ocupado,
  type Slot,
  type TipoDeAgendamento,
} from "@/lib/agenda/horarios-livres";

const SP = "America/Sao_Paulo";
// 05/11/2026 é quinta (dow 4). SP é UTC-3.
const JORNADA: JornadaDaAgenda = { timezone: SP, windows: [{ dow: 4, start: "09:00", end: "18:00" }] };
// Grade de minuto em minuto, para medir a borda exata (11:29 contra 11:30).
const DUAS_HORAS: TipoDeAgendamento = {
  duracaoMin: 120,
  bufferAntesMin: 0,
  bufferDepoisMin: 0,
  avisoMinimoMin: 0,
  intervaloMin: 1,
  janelaDias: 60,
};
const DIA = { de: new Date("2026-11-05T00:00:00Z"), ate: new Date("2026-11-05T23:59:59Z") };
const AGORA = new Date("2026-11-01T12:00:00Z");

function local(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 5, (h ?? 0) + 3, m ?? 0));
}
function crm(inicio: string, fim: string): Ocupado {
  return { inicio: local(inicio), fim: local(fim), doCrm: true };
}
function google(inicio: string, fim: string): Ocupado {
  return { inicio: local(inicio), fim: local(fim) };
}
function horas(slots: Slot[]): string[] {
  return slots.map((s) => {
    const p = partesNoFuso(s.inicio, SP);
    return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  });
}
function livres(ocupados: Ocupado[], opcoes: { capacidade?: number; tolerancia?: number; tipo?: TipoDeAgendamento } = {}) {
  const { tipo = DUAS_HORAS, ...resto } = opcoes;
  return horas(horariosLivres({ jornada: JORNADA, excecoes: [], ocupados, tipo, ...DIA, agora: AGORA, ...resto }));
}

describe("capacidade 1, tolerância 30, compromisso 10:00–12:00", () => {
  const grade = livres([crm("10:00", "12:00")], { capacidade: 1, tolerancia: 30 });

  it("11:30 livre", () => expect(grade).toContain("11:30"));
  it("11:29 ocupado", () => expect(grade).not.toContain("11:29"));
  it("10:00 ocupado", () => expect(grade).not.toContain("10:00"));

  it("CONTROLE: sem tolerância, 11:30 está ocupado", () => {
    expect(livres([crm("10:00", "12:00")], { capacidade: 1 })).not.toContain("11:30");
  });

  it("vale para os dois lados: o novo que termina 30 min depois do início do seguinte também cabe", () => {
    // 09:30–11:30 contra 11:00–13:00: a mesma relação física vista da outra ponta.
    const comVizinhoDepois = livres([crm("11:00", "13:00")], { capacidade: 1, tolerancia: 30 });
    expect(comVizinhoDepois).toContain("09:30"); // 09:30–11:30 encosta na tolerância dele
    expect(comVizinhoDepois).not.toContain("09:31");
  });
});

describe("capacidade 2, tolerância 30", () => {
  const dois = [crm("10:00", "12:00"), crm("10:00", "12:00")];

  it("dois compromissos 10:00–12:00 bloqueiam 11:00", () => {
    expect(livres(dois, { capacidade: 2, tolerancia: 30 })).not.toContain("11:00");
  });

  it("e liberam 11:30", () => {
    expect(livres(dois, { capacidade: 2, tolerancia: 30 })).toContain("11:30");
  });

  it("CONTROLE: com um só, 11:00 cabe (a capacidade 2 ainda tem vaga)", () => {
    expect(livres([crm("10:00", "12:00")], { capacidade: 2, tolerancia: 30 })).toContain("11:00");
  });
});

describe("tolerância 0 reproduz exatamente a grade de hoje", () => {
  const cenarios: Array<[string, Ocupado[], number]> = [
    ["vazio", [], 1],
    ["um compromisso", [crm("10:00", "12:00")], 1],
    ["dois sobrepostos, capacidade 2", [crm("10:00", "12:00"), crm("11:00", "13:00")], 2],
    ["encadeados", [crm("09:00", "10:00"), crm("10:00", "11:00"), crm("15:00", "16:00")], 1],
    ["compromisso e Google", [crm("10:00", "12:00"), google("14:00", "15:00")], 2],
  ];

  it.each(cenarios)("%s", (_nome, ocupados, capacidade) => {
    const hoje = livres(ocupados, { capacidade });
    expect(livres(ocupados, { capacidade, tolerancia: 0 })).toEqual(hoje);
    expect(hoje.length).toBeGreaterThan(0);
  });

  it("CONTROLE: o mesmo cenário com tolerância 30 dá uma grade diferente (o teste mede)", () => {
    const ocupados = [crm("10:00", "12:00")];
    expect(livres(ocupados, { tolerancia: 30 })).not.toEqual(livres(ocupados));
  });
});

describe("o que a tolerância não toca", () => {
  it("evento do Google ocupa inteiro: 11:30 continua ocupado", () => {
    expect(livres([google("10:00", "12:00")], { tolerancia: 30 })).not.toContain("11:30");
  });

  it("tolerância maior que a duração não libera o mesmo instante", () => {
    const curto = crm("10:00", "10:20");
    expect(livres([curto], { tolerancia: 60 })).not.toContain("10:00");
    expect(livres([curto], { tolerancia: 60 })).toContain("10:01");
  });

  it("comTolerancia com 0 devolve a faixa intacta", () => {
    const faixa = { inicio: 1_000_000, fim: 1_000_000 + 5 * 60_000 };
    expect(comTolerancia(faixa, 0)).toEqual(faixa);
  });
});
