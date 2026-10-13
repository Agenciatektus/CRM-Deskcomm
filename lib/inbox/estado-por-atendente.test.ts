import { describe, expect, it } from "vitest";

import {
  estaSilenciada,
  estadoDaLinha,
  fixadasNoTopo,
  naoLidasDaConversa,
  silenciarSchema,
  silencioAte,
} from "./estado-por-atendente";

const AGORA = Date.parse("2026-10-07T12:00:00Z");

describe("silêncio", () => {
  it("'sempre' é 'infinity', e 'infinity' conta como silenciada (Date não entende a string)", () => {
    expect(silencioAte("sempre", AGORA)).toBe("infinity");
    expect(Number.isNaN(Date.parse("infinity"))).toBe(true);
    expect(estaSilenciada("infinity", AGORA)).toBe(true);
  });

  it("8h e 1 semana contam a partir de agora", () => {
    expect(silencioAte("8h", AGORA)).toBe("2026-10-07T20:00:00.000Z");
    expect(silencioAte("1w", AGORA)).toBe("2026-10-14T12:00:00.000Z");
  });

  it("vencido, nulo ou lixo não silencia", () => {
    expect(estaSilenciada("2026-10-07T11:59:59Z", AGORA)).toBe(false);
    expect(estaSilenciada(null, AGORA)).toBe(false);
    expect(estaSilenciada(undefined, AGORA)).toBe(false);
    expect(estaSilenciada("amanhã", AGORA)).toBe(false);
    expect(estaSilenciada("2026-10-07T12:00:01Z", AGORA)).toBe(true);
  });

  it("o corpo da rota só aceita as três durações, e nada além", () => {
    expect(silenciarSchema.safeParse({ duracao: "8h" }).success).toBe(true);
    expect(silenciarSchema.safeParse({ duracao: "2h" }).success).toBe(false);
    expect(silenciarSchema.safeParse({ duracao: "8h", user_id: "x" }).success).toBe(false);
  });
});

describe("contagem de não lidas da tela", () => {
  it("o contador do banco manda; marcada sem contador vale 1; nada vale 0", () => {
    expect(naoLidasDaConversa({ unread_count_for_assignee: 3, marked_unread: true })).toBe(3);
    expect(naoLidasDaConversa({ unread_count_for_assignee: 0, marked_unread: true })).toBe(1);
    expect(naoLidasDaConversa({ unread_count_for_assignee: 0 })).toBe(0);
    expect(naoLidasDaConversa({ unread_count_for_assignee: null, marked_unread: false })).toBe(0);
  });
});

describe("ordem e estado", () => {
  it("fixadas no topo na ordem dos pinned_at (a lista de fixadas), o resto como veio", () => {
    const linhas = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(fixadasNoTopo(linhas, ["c", "a"]).map((l) => l.id)).toEqual(["c", "a", "b", "d"]);
    expect(fixadasNoTopo(linhas, []).map((l) => l.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sem linha = nada; linha vira os três campos da lista", () => {
    expect(estadoDaLinha(undefined)).toEqual({ pinned: false, muted_until: null, marked_unread: false });
    expect(
      estadoDaLinha({ conversation_id: "x", pinned_at: "2026-10-07T00:00:00Z", muted_until: "infinity", marked_unread_at: null }),
    ).toEqual({ pinned: true, muted_until: "infinity", marked_unread: false });
  });
});
