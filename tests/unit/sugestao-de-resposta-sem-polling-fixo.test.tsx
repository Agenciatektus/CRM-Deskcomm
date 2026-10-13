import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReplyReviewPanel } from "@/components/inbox/composer/ReplyReviewPanel";
import { ApiError } from "@/lib/api/types";
import { makeQueryClient } from "@/lib/query/client";

/**
 * A revisão de resposta deixou de perguntar a cada 4 s com a conversa parada
 * (15 pedidos por minuto por conversa aberta). Ela pergunta quando chega
 * mensagem NESTA conversa (é a mensagem que faz a sugestão nascer, ou ficar
 * velha), rápido enquanto a sugestão é gerada, e uma vez por minuto fora disso.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

const CONVERSA = "c-1";
const pedidosDeSugestao = () =>
  api.get.mock.calls.filter(([url]) => String(url).includes(`/conversations/${CONVERSA}/draft-reply`)).length;

let qc: QueryClient;

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: { drafts: [] } });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.useRealTimers();
  qc.clear();
});

function montar() {
  return render(
    <QueryClientProvider client={qc}>
      <ReplyReviewPanel conversationId={CONVERSA} />
    </QueryClientProvider>,
  );
}

describe("ReplyReviewPanel", () => {
  it("parada, não pergunta de novo em 30 s (antes: 7 vezes)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();
    await waitFor(() => expect(pedidosDeSugestao()).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(pedidosDeSugestao()).toBe(1);
  });

  it("mensagem nova NESTA conversa pergunta na hora; de outra conversa, não", async () => {
    montar();
    await waitFor(() => expect(pedidosDeSugestao()).toBe(1));
    act(() => {
      qc.setQueryData(["messages", "outra"], { pages: [], pageParams: [] });
    });
    expect(pedidosDeSugestao()).toBe(1);
    act(() => {
      qc.setQueryData(["messages", CONVERSA], { pages: [], pageParams: [] });
    });
    await waitFor(() => expect(pedidosDeSugestao()).toBe(2));
  });

  it("sugestão sendo gerada: volta a perguntar em segundos, até ela sair", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.get.mockResolvedValue({
      data: {
        drafts: [
          { id: "d1", revision: "1", status: "generating", original_body: null, edited_body: null, error_code: null, proposals: [] },
        ],
      },
    });
    montar();
    await waitFor(() => expect(pedidosDeSugestao()).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(pedidosDeSugestao()).toBe(2);
  });

  it("503 'unavailable': UM pedido só, nem ao remontar nem com mensagem nova", async () => {
    // O cliente de PRODUÇÃO, que repete 429/503 por padrão.
    qc = makeQueryClient();
    api.get.mockRejectedValue(new ApiError(503, "unavailable", undefined, "req-1"));
    const primeira = montar();
    await waitFor(() => expect(qc.getQueryState(["reply-drafts", CONVERSA])?.status).toBe("error"));
    expect(pedidosDeSugestao()).toBe(1);
    // Sai da conversa e volta (ou alterna Responder/Nota): o painel remonta.
    primeira.unmount();
    montar();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(pedidosDeSugestao()).toBe(1);
    act(() => {
      qc.setQueryData(["messages", CONVERSA], { pages: [], pageParams: [] });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(pedidosDeSugestao()).toBe(1);
  });
});
