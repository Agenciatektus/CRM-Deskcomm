import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { conversaDeExemplo } from "@/components/inbox/__fixtures__/conversa";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * A FAIXA DE QUEM ATENDE, acima da caixa do composer (visual v2, fase 3.5).
 *
 * Quem escreve precisa saber, antes de escrever, se está falando por cima da
 * IA ou numa conversa que ninguém pegou. A regra é `comandoDaConversa` (a mesma
 * do cabeçalho); aqui se prende a frase, o gesto e o `claim` que ele dispara.
 * O modo LEITURA não chega a montar o composer: quem prende isso é
 * `painel-da-conversa-quem-responde.test.tsx` (`conversa-somente-leitura`).
 */

const claimMock = vi.fn();
const automatico = vi.hoisted(() => ({ ativo: true as boolean | undefined }));

vi.mock("@/hooks/inbox/useSendMessage", () => ({ useSendMessage: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useCreateNote", () => ({ useCreateNote: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({ useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({ useMessageTemplates: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: claimMock, isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({ useAutomaticoAtivo: () => ({ data: automatico.ativo }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: { drafts: [] } }), post: vi.fn() },
}));

import { Composer } from "@/components/inbox/Composer";
import { apiClient } from "@/lib/api/client";

function conversa(over: Partial<ConversationWithContact> = {}): ConversationWithContact {
  return { ...conversaDeExemplo.conversation, ...over };
}

function montar(c: ConversationWithContact) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId={c.id} conversa={c} />
    </QueryClientProvider>,
  );
}

describe("Composer: faixa de quem atende", () => {
  beforeEach(() => {
    claimMock.mockClear();
    automatico.ativo = true;
  });

  it("a IA atendendo: avisa que assumir para o automático e assume pelo claim", () => {
    montar(conversa());
    expect(screen.getByTestId("faixa-do-dono")).toHaveAttribute("data-quem", "ia");
    expect(screen.getByText("A IA está atendendo.")).toBeInTheDocument();
    expect(screen.getByText("Ao assumir, o automático para.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assumir a conversa" }));
    expect(claimMock).toHaveBeenCalledWith({ conversation_id: "conv-1", expected_assignee: null });
    // A caixa continua disponível: a faixa avisa, não bloqueia.
    expect(screen.getByLabelText("Mensagem")).not.toBeDisabled();
  });

  it("ninguém assumiu (automático calado e sem dono): convida a puxar para si", () => {
    montar(conversa({ bot_silenced_until: "infinity" }));
    expect(screen.getByTestId("faixa-do-dono")).toHaveAttribute("data-quem", "ninguem");
    fireEvent.click(screen.getByRole("button", { name: "Puxar para mim" }));
    expect(claimMock).toHaveBeenCalledWith({ conversation_id: "conv-1", expected_assignee: null });
  });

  it("org sem automático e sem dono também é 'ninguém', nunca 'a IA está atendendo'", () => {
    automatico.ativo = false;
    montar(conversa());
    expect(screen.getByTestId("faixa-do-dono")).toHaveAttribute("data-quem", "ninguem");
    expect(screen.queryByText("A IA está atendendo.")).toBeNull();
  });

  it("você atende: nenhuma faixa em cima da caixa", () => {
    montar(conversa({ assigned_to_user_id: "u-1", assigned_to_user_name: "Eu", assignee_kind: "user" }));
    expect(screen.queryByTestId("faixa-do-dono")).toBeNull();
  });

  it("em nota interna a faixa sai: assumir não muda nada no que só o time lê", () => {
    montar(conversa());
    fireEvent.click(screen.getByRole("button", { name: "Nota interna" }));
    expect(screen.queryByTestId("faixa-do-dono")).toBeNull();
  });

  it("o botão não se chama só 'Assumir': as specs do cabeçalho o procuram com nome exato", () => {
    montar(conversa());
    expect(screen.queryByRole("button", { name: "Assumir" })).toBeNull();
  });

  it("sem a conversa em mãos o composer não afirma nada sobre o dono", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <Composer conversationId="conv-1" />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("faixa-do-dono")).toBeNull();
  });
});

describe("Composer: a dica de teclado fica à vista", () => {
  it("responder e nota têm a dica própria, ligada ao campo", () => {
    montar(conversa({ assigned_to_user_id: "u-1" }));
    const campo = screen.getByLabelText("Mensagem");
    const dica = document.getElementById(campo.getAttribute("aria-describedby")!);
    expect(dica?.textContent).toBe("Enter envia, Shift+Enter quebra linha");
    fireEvent.click(screen.getByRole("button", { name: "Nota interna" }));
    expect(dica?.textContent).toBe("Enter salva a nota, Shift+Enter quebra linha");
  });
});

describe("Composer: a sugestão não pergunta ao servidor no modo Nota", () => {
  it("aberto em Nota interna, nenhum pedido de sugestão; ao voltar para Responder, pergunta", async () => {
    vi.mocked(apiClient.get).mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Composer conversationId="conv-1" initialMode="note" />
      </QueryClientProvider>,
    );
    const pedidos = () => vi.mocked(apiClient.get).mock.calls.filter(([url]) => String(url).includes("/draft-reply")).length;
    await new Promise((r) => setTimeout(r, 20));
    expect(pedidos()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await waitFor(() => expect(pedidos()).toBe(1));
  });
});
