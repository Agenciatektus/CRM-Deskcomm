import { describe, expect, it } from "vitest";

import type { ThreadItem } from "@/components/inbox/ChatThread";
import { iniciaBloco, indiceDoDiaAtivo, montarLinhas, primeiraNaoLida } from "@/components/inbox/fio/linhas";
import type { Message } from "@/lib/types/messaging";

const item = (id: string, ts: string): ThreadItem =>
  ({ kind: "message", ts, data: { id } as Message }) as ThreadItem;

describe("montarLinhas", () => {
  const itens = [
    item("a", "2026-09-24T12:00:00"),
    item("b", "2026-09-24T13:00:00"),
    item("c", "2026-09-25T09:00:00"),
  ];

  it("um rótulo por dia, antes das mensagens do dia, com chaves estáveis", () => {
    const linhas = montarLinhas(itens, false);
    expect(linhas.map((l) => l.key)).toEqual([
      "dia-2026-09-24",
      "msg-a",
      "msg-b",
      "dia-2026-09-25",
      "msg-c",
    ]);
  });

  it("com histórico a carregar, o botão é a primeira linha", () => {
    expect(montarLinhas(itens, true)[0]).toEqual({ tipo: "mais", key: "carregar-mais" });
  });

  it("o dia ativo é o último rótulo até a linha do topo", () => {
    const linhas = montarLinhas(itens, true);
    expect(indiceDoDiaAtivo(linhas, 0)).toBe(-1);
    expect(indiceDoDiaAtivo(linhas, 3)).toBe(1);
    expect(indiceDoDiaAtivo(linhas, 4)).toBe(4);
    expect(indiceDoDiaAtivo(linhas, 5)).toBe(4);
  });
});

/**
 * O divisor "Novas mensagens" (visual v2, fase 3.5). Ele é LINHA do fio, com
 * chave fixa, para o virtualizador medi-lo como as outras e a âncora no fim
 * não pular quando ele entra.
 */
describe("divisor de novas mensagens", () => {
  const recebida = (id: string, ts: string): ThreadItem =>
    ({ kind: "message", ts, data: { id, direction: "inbound" } as Message }) as ThreadItem;
  const enviada = (id: string, ts: string): ThreadItem =>
    ({ kind: "message", ts, data: { id, direction: "outbound" } as Message }) as ThreadItem;
  const itens = [
    recebida("r1", "2026-09-24T12:00:00"),
    enviada("e1", "2026-09-24T12:01:00"),
    recebida("r2", "2026-09-25T09:00:00"),
    enviada("e2", "2026-09-25T09:01:00"),
    recebida("r3", "2026-09-25T09:02:00"),
  ];

  it("conta só as RECEBIDAS do fim para trás: 2 não lidas abrem em r2", () => {
    expect(primeiraNaoLida(itens, 2)).toBe("r2");
    expect(primeiraNaoLida(itens, 1)).toBe("r3");
  });

  it("fica antes da primeira não lida e DEPOIS do rótulo do dia dela", () => {
    const linhas = montarLinhas(itens, false, primeiraNaoLida(itens, 2));
    expect(linhas.map((l) => l.key)).toEqual([
      "dia-2026-09-24",
      "msg-r1",
      "msg-e1",
      "dia-2026-09-25",
      "novas-mensagens",
      "msg-r2",
      "msg-e2",
      "msg-r3",
    ]);
  });

  it("sem não lidas não há divisor", () => {
    expect(primeiraNaoLida(itens, 0)).toBeNull();
    expect(montarLinhas(itens, false, null).some((l) => l.tipo === "novas")).toBe(false);
  });

  it("mais não lidas do que o carregado: o divisor vai na recebida mais antiga da página", () => {
    expect(primeiraNaoLida(itens, 50)).toBe("r1");
  });
});

describe("blocos de falas seguidas", () => {
  const m = (id: string, ts: string, over: Partial<Message> = {}): ThreadItem =>
    ({
      kind: "message",
      ts,
      data: { id, sent_at: ts, direction: "outbound", sent_via: "user", sent_by_user_id: "u1", metadata: {}, ...over } as Message,
    }) as ThreadItem;

  it("mesma pessoa em até 5 min continua o bloco; outro autor ou intervalo maior abre outro", () => {
    const linhas = montarLinhas(
      [
        m("a", "2026-09-24T12:00:00"),
        m("b", "2026-09-24T12:02:00"),
        m("c", "2026-09-24T12:03:00", { sent_via: "ai", sent_by_user_id: null }),
        m("d", "2026-09-24T12:20:00", { sent_via: "ai", sent_by_user_id: null }),
      ],
      false,
    );
    // linha 0 é o dia
    expect([1, 2, 3, 4].map((i) => iniciaBloco(linhas, i))).toEqual([true, false, true, true]);
  });

  it("o divisor de novas quebra o bloco", () => {
    const itens = [m("a", "2026-09-24T12:00:00", { direction: "inbound" }), m("b", "2026-09-24T12:01:00", { direction: "inbound" })];
    const linhas = montarLinhas(itens, false, "b");
    expect(iniciaBloco(linhas, linhas.findIndex((l) => l.key === "msg-b"))).toBe(true);
  });
});

describe("blocos: fala em nome de pessoas diferentes", () => {
  it("o mesmo token falando por Ana e depois por Bruno não vira um bloco só", () => {
    const m = (id: string, por: string): ThreadItem =>
      ({
        kind: "message",
        ts: "2026-09-24T12:00:00",
        data: { id, sent_at: "2026-09-24T12:00:00", direction: "outbound", sent_via: "system", sent_by_user_id: null, sent_on_behalf_of_user_id: por, metadata: {} } as unknown as Message,
      }) as ThreadItem;
    const linhas = montarLinhas([m("a", "ana"), m("b", "bruno"), m("c", "bruno")], false);
    expect([1, 2, 3].map((i) => iniciaBloco(linhas, i))).toEqual([true, true, false]);
  });
});
