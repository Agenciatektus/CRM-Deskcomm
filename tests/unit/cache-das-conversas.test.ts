import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  agendarRefazer,
  aplicarMudancaDaConversa,
  esquecerConversaSemAcesso,
  invalidarListasDaConversa,
} from "@/hooks/inbox/cacheDasConversas";

/**
 * A mudança numa conversa atualiza o cache DIRIGIDO: corrige a linha onde ela
 * está e refaz só a lista em que a ordem ou a pertença pode ter mudado. Antes,
 * qualquer evento refazia todas as listas pelo prefixo `["conversations"]`.
 */

const FILA = ["conversations", { status: ["open", "pending"] }] as const;
const MINHAS = ["conversations", { assigned_to: "me" }] as const;
const TODAS = ["conversations", {}] as const;

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "open",
  assigned_to_user_id: null,
  last_message_at: "2026-10-01T10:00:00Z",
  last_message_preview: "oi",
  unread_count_for_assignee: 0,
  contacts: { id: "ct", display_name: "Fulano" },
  ...extra,
});

const lista = (...linhas: ReturnType<typeof linha>[]) => ({
  pages: [{ data: linhas, meta: { has_more: false } }],
  pageParams: [undefined],
});

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient();
  qc.setQueryData(FILA, lista(linha("c1"), linha("c2")));
  qc.setQueryData(MINHAS, lista());
  qc.setQueryData(TODAS, lista(linha("c1"), linha("c2"), linha("c9", { status: "closed" })));
});

afterEach(() => {
  vi.useRealTimers();
});

const chaves = (qs: { queryKey: readonly unknown[] }[]) => qs.map((q) => JSON.stringify(q.queryKey)).sort();
const itens = (k: readonly unknown[]) =>
  (qc.getQueryData(k) as ReturnType<typeof lista>).pages.flatMap((p) => p.data);

describe("aplicarMudancaDaConversa", () => {
  it("só a prévia mudou: corrige no lugar e não refaz lista nenhuma", () => {
    // O evento do realtime traz a linha INTEIRA da tabela (sem os objetos que a rota junta).
    const { contacts: _semJuncao, ...doBanco } = linha("c1", { last_message_preview: "novo texto" });
    const alvos = aplicarMudancaDaConversa(qc, doBanco, "UPDATE");
    expect(alvos).toEqual([]);
    expect(itens(FILA).find((c) => c.id === "c1")?.last_message_preview).toBe("novo texto");
    expect(itens(TODAS).find((c) => c.id === "c1")?.last_message_preview).toBe("novo texto");
    // O objeto juntado pela rota (contacts) não é apagado pelo evento, que não o traz.
    expect(itens(FILA).find((c) => c.id === "c1")?.contacts).toEqual({ id: "ct", display_name: "Fulano" });
  });

  it("a ordem mudou (mensagem nova): refaz as listas que a mostram e as que ela pode passar a mostrar", () => {
    const alvos = aplicarMudancaDaConversa(
      qc,
      { id: "c1", last_message_at: "2026-10-02T10:00:00Z", assigned_to_user_id: null, status: "open" },
      "UPDATE",
    );
    // MINHAS não a mostra e o filtro a exclui com certeza (sem dono não é "minha").
    expect(chaves(alvos)).toEqual(chaves([{ queryKey: FILA }, { queryKey: TODAS }]));
  });

  it("conversa fora de toda lista e excluída pelo filtro: a fila não é refeita", () => {
    const alvos = aplicarMudancaDaConversa(qc, { id: "c7", status: "closed", assigned_to_user_id: null }, "UPDATE");
    // Fechada não entra na fila (status) nem em "minhas" (sem dono); "todas" não tem filtro e pode recebê-la.
    expect(chaves(alvos)).toEqual(chaves([{ queryKey: TODAS }]));
  });

  it("DELETE tira a linha das listas sem refazer nada", () => {
    const alvos = aplicarMudancaDaConversa(qc, { id: "c2" }, "DELETE");
    expect(alvos).toEqual([]);
    expect(itens(FILA).map((c) => c.id)).toEqual(["c1"]);
    expect(itens(TODAS).map((c) => c.id)).toEqual(["c1", "c9"]);
  });
});

describe("agendarRefazer", () => {
  it("junta os pedidos de uma janela curta: cada lista é refeita UMA vez", () => {
    vi.useFakeTimers();
    const espia = vi.spyOn(qc, "invalidateQueries");
    const fila = qc.getQueryCache().find({ queryKey: FILA, exact: true })!;
    const todas = qc.getQueryCache().find({ queryKey: TODAS, exact: true })!;
    agendarRefazer(qc, [fila]);
    agendarRefazer(qc, [fila, todas]);
    agendarRefazer(qc, [todas]);
    expect(espia).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(espia).toHaveBeenCalledTimes(2);
    expect(chaves(espia.mock.calls.map((c) => c[0] as { queryKey: readonly unknown[] }))).toEqual(
      chaves([{ queryKey: FILA }, { queryKey: TODAS }]),
    );
  });
});

describe("invalidarListasDaConversa (depois de um botão)", () => {
  it("marca todas como velhas sem refazer, e refaz só as que mostram a conversa", () => {
    vi.useFakeTimers();
    const espia = vi.spyOn(qc, "invalidateQueries");
    invalidarListasDaConversa(qc, "c9");
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0]?.[0]).toMatchObject({ queryKey: ["conversations"], refetchType: "none" });
    vi.advanceTimersByTime(300);
    const refeitas = espia.mock.calls.slice(1).map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(refeitas).toEqual([JSON.stringify(TODAS)]);
  });
});

describe("esquecerConversaSemAcesso (P2-1 do Cassio na #67)", () => {
  it("404/403 ao abrir: a conversa sai das listas na hora, sem esperar o refetch", () => {
    esquecerConversaSemAcesso(qc, "c1", { status: 404 });
    expect(itens(FILA).map((c) => c.id)).toEqual(["c2"]);
    esquecerConversaSemAcesso(qc, "c2", { status: 403 });
    expect(itens(FILA).map((c) => c.id)).toEqual([]);
    expect(itens(TODAS).map((c) => c.id)).toEqual(["c9"]);
  });

  it("outro erro (500, rede) não tira nada: a conversa pode ainda ser dela", () => {
    esquecerConversaSemAcesso(qc, "c1", { status: 500 });
    esquecerConversaSemAcesso(qc, "c1", new Error("rede"));
    expect(itens(FILA).map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});
