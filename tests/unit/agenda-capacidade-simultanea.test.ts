/**
 * Atendimentos simultâneos (migration 9083): a Camila, no salão, segura 4 clientes
 * ao mesmo tempo porque a química age enquanto ela atende outra. A regra do motor:
 * compromisso do CRM divide o horário até a capacidade; Google e bloqueio ocupam
 * inteiro. Capacidade 1 (ou ausente) é o comportamento de sempre.
 */
import { describe, expect, it } from "vitest";

import { partesNoFuso } from "@/lib/agenda/fuso";
import {
  horariosLivres,
  simultaneosNoPico,
  type JornadaDaAgenda,
  type Ocupado,
  type Slot,
  type TipoDeAgendamento,
} from "@/lib/agenda/horarios-livres";

const SP = "America/Sao_Paulo";
// 05/11/2026 é quinta (dow 4). SP é UTC-3: 13:00 local = 16:00Z.
const JORNADA: JornadaDaAgenda = { timezone: SP, windows: [{ dow: 4, start: "09:00", end: "18:00" }] };
const UMA_HORA: TipoDeAgendamento = {
  duracaoMin: 60,
  bufferAntesMin: 0,
  bufferDepoisMin: 0,
  avisoMinimoMin: 0,
  janelaDias: 60,
};
const DIA = { de: new Date("2026-11-05T00:00:00Z"), ate: new Date("2026-11-05T23:59:59Z") };
const AGORA = new Date("2026-11-01T12:00:00Z");

function horas(slots: Slot[]): string[] {
  return slots.map((s) => {
    const p = partesNoFuso(s.inicio, SP);
    return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  });
}

/** Compromisso do CRM em hora local de SP (`"13:00"`, `"15:30"`). */
function crm(inicio: string, fim: string): Ocupado {
  return { inicio: local(inicio), fim: local(fim), doCrm: true };
}
function google(inicio: string, fim: string): Ocupado {
  return { inicio: local(inicio), fim: local(fim) };
}
function local(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 5, (h ?? 0) + 3, m ?? 0));
}

function livres(ocupados: Ocupado[], capacidade?: number, tipo = UMA_HORA): string[] {
  return horas(horariosLivres({ jornada: JORNADA, excecoes: [], ocupados, tipo, ...DIA, agora: AGORA, capacidade }));
}

describe("capacidade 1 é o comportamento de antes", () => {
  it("sem capacidade informada, um compromisso esconde o horário", () => {
    expect(livres([crm("13:00", "14:00")])).not.toContain("13:00");
  });

  it("capacidade 1 dá a MESMA grade que antes, compromisso a compromisso", () => {
    const ocupados = [crm("10:00", "11:30"), crm("14:00", "15:00")];
    expect(livres(ocupados, 1)).toEqual(livres(ocupados));
    expect(livres(ocupados, 1)).toEqual(["09:00", "12:00", "13:00", "15:00", "16:00", "17:00"]);
  });
});

describe("capacidade 4", () => {
  const tres = [crm("13:00", "14:00"), crm("13:00", "14:00"), crm("13:00", "14:00")];

  it("com 3 clientes às 13h, o 13:00 continua oferecido", () => {
    expect(livres(tres, 4)).toContain("13:00");
  });

  it("com 4 clientes às 13h, o 13:00 some (a 5ª não entra)", () => {
    expect(livres([...tres, crm("13:00", "14:00")], 4)).not.toContain("13:00");
  });

  it("evento do Google bloqueia inteiro, capacidade não se aplica", () => {
    expect(livres([google("13:00", "14:00")], 4)).not.toContain("13:00");
  });

  it("Leila 13h e Suelen 14h (progressiva de 2h30) não esgotam a Camila", () => {
    const tarde = [crm("13:00", "15:30"), crm("14:00", "16:30")];
    const progressiva = { ...UMA_HORA, duracaoMin: 150, intervaloMin: 30 };
    // 15:30 é o último início que cabe até 18:00.
    expect(livres(tarde, 4, progressiva)).toEqual(
      ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"],
    );
    // E com capacidade 1 as mesmas duas tomam a tarde inteira.
    expect(livres(tarde, 1, progressiva)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });
});

describe("o pico, não a contagem de quem cruza", () => {
  it("13-14, 14-15 e 15-16 cruzam uma faixa 13h-16h e nunca há dois juntos", () => {
    const encadeados = [crm("13:00", "14:00"), crm("14:00", "15:00"), crm("15:00", "16:00")];
    const faixa = { inicio: local("13:00").getTime(), fim: local("16:00").getTime() };
    const emMs = encadeados.map((o) => ({ inicio: o.inicio.getTime(), fim: o.fim.getTime() }));
    expect(simultaneosNoPico(faixa, emMs)).toBe(1);
    const tresHoras = { ...UMA_HORA, duracaoMin: 180, intervaloMin: 60 };
    expect(livres(encadeados, 2, tresHoras)).toContain("13:00");
    // Controle: com capacidade 1 o mesmo 13:00 some.
    expect(livres(encadeados, 1, tresHoras)).not.toContain("13:00");
  });

  it("dois sobrepostos no meio da faixa contam 2", () => {
    const faixa = { inicio: local("13:00").getTime(), fim: local("16:00").getTime() };
    const emMs = [crm("14:00", "15:00"), crm("14:30", "15:30")].map((o) => ({ inicio: o.inicio.getTime(), fim: o.fim.getTime() }));
    expect(simultaneosNoPico(faixa, emMs)).toBe(2);
  });
});
