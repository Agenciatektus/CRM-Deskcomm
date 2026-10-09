import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "eu" }, activeOrg: { orgId: "org-1", role: "agent" } }),
  usePermission: () => true,
}));

import { TransferirPopover } from "@/components/inbox/cabecalho/TransferirPopover";

/**
 * TRANSFERIR em popover: mesma fonte de destinos (`/api/v1/team/assignable`),
 * mesma rota de transferência. O que muda é o gesto, e é o gesto que se mede:
 * abre no ícone, fecha com Esc e com clique fora, e escolher alguém chama a rota.
 */
const MEMBROS = [
  { user_id: "eu", role: "agent", full_name: "Eu Mesmo" },
  { user_id: "u-bruno", role: "agent", full_name: "Bruno Sales" },
  { user_id: "u-leticia", role: "manager", full_name: "Letícia Andrade" },
];

function montar(props: Partial<React.ComponentProps<typeof TransferirPopover>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <button type="button">fora</button>
      <TransferirPopover conversationId="conv-1" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  getMock.mockImplementation(async (url: string) =>
    url === "/api/v1/team/assignable" ? { data: MEMBROS } : { data: [] },
  );
  postMock.mockResolvedValue({ data: {} });
});

describe("TransferirPopover", () => {
  it("lista os colegas (sem a própria pessoa); clicar no nome só SELECIONA", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));

    const bruno = await screen.findByRole("radio", { name: /Bruno Sales/ });
    expect(screen.getByRole("radio", { name: /Letícia Andrade/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Eu Mesmo/ }), "a própria pessoa não é destino").toBeNull();
    expect(screen.getByRole("button", { name: "Escolha o atendente" })).toBeDisabled();

    await user.click(bruno);
    expect(bruno).toHaveAttribute("aria-checked", "true");
    expect(postMock, "clicar no nome não transfere").not.toHaveBeenCalled();
  });

  it("o motivo fica ACIMA da lista, e confirmar chama a rota com destino e motivo", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    const bruno = await screen.findByRole("radio", { name: /Bruno Sales/ });
    const motivo = screen.getByRole("textbox", { name: "Motivo (opcional)" });
    // DOCUMENT_POSITION_FOLLOWING: o radio vem DEPOIS do campo no documento.
    expect(motivo.compareDocumentPosition(bruno) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(motivo, "financeiro");
    await user.click(bruno);
    await user.click(screen.getByRole("button", { name: "Transferir para Bruno Sales" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [url, corpo] = postMock.mock.calls[0]!;
    expect(String(url)).toContain("/conv-1/");
    expect(corpo).toEqual({ to_user_id: "u-bruno", reason: "financeiro" });
  });

  it("selecionar e depois Esc cancela sem efeito", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    await user.click(await screen.findByRole("radio", { name: /Bruno Sales/ }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Bruno Sales/ })).toBeNull());
    expect(postMock).not.toHaveBeenCalled();
    // Reabrir começa do zero: a seleção não sobrevive ao cancelamento.
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    expect(await screen.findByRole("radio", { name: /Bruno Sales/ })).toHaveAttribute("aria-checked", "false");
  });

  it("Esc fecha sem transferir", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    await screen.findByRole("radio", { name: /Bruno Sales/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Bruno Sales/ })).toBeNull());
    expect(postMock).not.toHaveBeenCalled();
  });

  it("selecionar e clicar fora fecha sem transferir", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    await user.click(await screen.findByRole("radio", { name: /Bruno Sales/ }));
    // O Radix escuta `pointerdown` fora do conteúdo; o user-event dispara a
    // sequência inteira (pointerdown, mousedown, click), como um clique real.
    await user.click(screen.getByText("fora"));
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Bruno Sales/ })).toBeNull());
    expect(postMock).not.toHaveBeenCalled();
  });

  it("lista longa ganha busca por nome", async () => {
    getMock.mockImplementation(async () => ({
      data: Array.from({ length: 9 }, (_, i) => ({ user_id: `u-${i}`, role: "agent", full_name: `Pessoa ${i}` })),
    }));
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    await screen.findByRole("radio", { name: /Pessoa 0/ });
    await user.type(screen.getByRole("textbox", { name: "Buscar atendente" }), "7");
    expect(screen.getByRole("radio", { name: /Pessoa 7/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Pessoa 0/ })).toBeNull();
  });

  it("com trava vigente, oferece devolver ao automático pela mesma mutação do botão", async () => {
    const onDevolver = vi.fn();
    const user = userEvent.setup();
    montar({ devolver: { onDevolver, pendente: false } });
    await user.click(screen.getByRole("button", { name: "Transferir conversa" }));
    await user.click(await screen.findByRole("button", { name: "Devolver ao automático" }));
    expect(onDevolver).toHaveBeenCalledOnce();
    expect(postMock).not.toHaveBeenCalled();
  });
});
