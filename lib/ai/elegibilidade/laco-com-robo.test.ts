import { describe, expect, it } from "vitest";

import {
  detectarLacoComRobo,
  normalizarTexto,
  type MensagemDaConversa,
} from "./laco-com-robo";

const agora = new Date("2026-10-28T12:00:00Z");
const msg = (
  direcao: "inbound" | "outbound",
  texto: string,
  minAtras = 1,
): MensagemDaConversa => ({
  direcao,
  texto,
  enviadoEm: new Date(agora.getTime() - minAtras * 60_000),
  enviadaPelaIa: direcao === "outbound",
});
const varias = (n: number, d: "inbound" | "outbound", prefixo = "msg") =>
  Array.from({ length: n }, (_, i) => msg(d, `${prefixo} ${"x".repeat(i)}`, i + 1));

describe("volume", () => {
  it("12 da IA + 6 do cliente dispara", () => {
    const r = detectarLacoComRobo([...varias(12, "outbound"), ...varias(6, "inbound", "oi")], agora);
    expect(r).toEqual({ laco: true, motivo: "volume" });
  });
  it("11 da IA não dispara", () => {
    expect(detectarLacoComRobo([...varias(11, "outbound"), ...varias(6, "inbound", "oi")], agora).laco).toBe(false);
  });
  it("só IA, sem cliente, não dispara", () => {
    expect(detectarLacoComRobo(varias(30, "outbound"), agora).laco).toBe(false);
  });
  it("conversa normal com 5 trocas não é afetada", () => {
    const m = [...varias(5, "outbound"), ...varias(5, "inbound", "pergunta")];
    expect(detectarLacoComRobo(m, agora)).toEqual({ laco: false, motivo: null });
  });
  it("mensagens fora da janela de 60 min não contam", () => {
    const velhas = [...varias(12, "outbound"), ...varias(6, "inbound", "oi")].map((m) => ({
      ...m,
      enviadoEm: new Date(agora.getTime() - 120 * 60_000),
    }));
    expect(detectarLacoComRobo(velhas, agora).laco).toBe(false);
  });
});

describe("repeticao", () => {
  const menu = "Digite 1 para falar com o atendimento";
  it("3 entradas iguais com >= 20 chars dispara", () => {
    const r = detectarLacoComRobo([msg("inbound", menu, 1), msg("inbound", menu, 2), msg("inbound", menu, 3)], agora);
    expect(r).toEqual({ laco: true, motivo: "repeticao" });
  });
  it("2 iguais não dispara", () => {
    expect(detectarLacoComRobo([msg("inbound", menu, 1), msg("inbound", menu, 2)], agora).laco).toBe(false);
  });
  it("texto curto repetido não dispara", () => {
    const ok = [1, 2, 3, 4].map((i) => msg("inbound", "ok", i));
    expect(detectarLacoComRobo(ok, agora).laco).toBe(false);
  });
  it("protocolo com número diferente, acento e caixa viram o mesmo texto", () => {
    const m = [
      msg("inbound", "Seu protocolo é 123456. Aguarde atendimento!", 1),
      msg("inbound", "seu protocolo e 987. aguarde atendimento", 2),
      msg("inbound", "SEU PROTOCOLO É 55 - Aguarde  atendimento.", 3),
    ];
    expect(detectarLacoComRobo(m, agora).motivo).toBe("repeticao");
    expect(normalizarTexto("Olá, 12!")).toBe("ola");
  });
});
