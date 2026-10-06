/**
 * O menu de contexto LIGADO na lista de verdade (fase 3.6): a linha abre o
 * menu, o menu lê a conversa viva da lista e rolar a lista fecha o menu (um
 * menu ancorado num ponto fixo ficaria apontando para a linha errada).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { conversaDeExemplo } from "./__fixtures__/conversa";
import { ConversationList } from "./ConversationList";

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(), patch: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: null } }),
  useAuthOpcional: () => ({ user: { id: "u1" } }),
  usePermission: () => true,
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({ useChannelSessions: () => ({ data: [] }) }));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({ useAutomaticoAtivo: () => ({ data: true }) }));

function montar() {
  const listQuery = {
    isLoading: false,
    isError: false,
    hasNextPage: false,
    data: { pages: [{ data: [conversaDeExemplo.conversation] }], pageParams: [] },
  } as unknown as Parameters<typeof ConversationList>[0]["listQuery"];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConversationList listQuery={listQuery} filters={{}} selectedId={null} onSelect={() => {}} />
    </QueryClientProvider>,
  );
  return document.querySelector<HTMLElement>("[data-conversation-id]")!;
}

describe("ConversationList — menu de contexto", () => {
  it("botão direito na linha abre o menu da conversa certa", () => {
    const linha = montar();
    fireEvent.contextMenu(linha, { clientX: 50, clientY: 60 });
    expect(screen.getByRole("menu", { name: "Ações da conversa com Maria" })).toBeInTheDocument();
  });

  it("rolar a lista fecha o menu", async () => {
    const linha = montar();
    fireEvent.contextMenu(linha, { clientX: 50, clientY: 60 });
    const rolagem = linha.closest(".overflow-y-auto")!;
    fireEvent.scroll(rolagem);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
