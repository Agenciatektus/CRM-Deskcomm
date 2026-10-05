import { describe, expect, it } from "vitest";

import type { ThreadItem } from "@/components/inbox/ChatThread";
import { indiceDoDiaAtivo, montarLinhas } from "@/components/inbox/fio/linhas";
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
