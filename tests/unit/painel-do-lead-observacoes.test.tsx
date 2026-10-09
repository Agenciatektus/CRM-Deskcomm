import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ObservacoesDoContato } from "@/components/inbox/painel/ObservacoesDoContato";

/**
 * O BLOCO "OBS" DO RESUMO (migration 9041).
 *
 *  1. Mostra o que está salvo no contato e conta os caracteres.
 *  2. Salva ao sair do campo e no botão, e o clique logo depois do blur não
 *     manda o mesmo PATCH duas vezes.
 *  3. Sem mudança, não salva (sair do campo sem editar não é escrita).
 *  4. Esvaziar e sair manda vazio, que a rota transforma em null (apagar).
 *  5. Leitura (suporte somente leitura, viewer) e anonimizado: só o texto.
 */

const CONTATO = "c0000000-0000-4000-8000-000000009041";

const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mutacao = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({ useUpdateContact: () => mutacao }));

let salvo: string | null = null;

function renderObs(props: Partial<React.ComponentProps<typeof ObservacoesDoContato>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ObservacoesDoContato contactId={CONTATO} anonimizado={false} leitura={false} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  salvo = null;
  mutacao.mutate.mockReset();
  mutacao.isPending = false;
  get.mockReset();
  get.mockImplementation(() => Promise.resolve({ data: { id: CONTATO, observacoes: salvo } }));
});

describe("observações do contato — edição", () => {
  it("mostra o texto salvo e o contador", async () => {
    salvo = "prefere ligação à tarde";
    renderObs();
    const campo = await screen.findByRole("textbox", { name: "Observações" });
    expect(campo).toHaveValue("prefere ligação à tarde");
    expect(screen.getByText("23/4000")).toBeInTheDocument();
    expect(campo).toHaveAttribute("maxLength", "4000");
  });

  it("salva ao sair do campo; o botão logo depois não repete o PATCH", async () => {
    renderObs();
    const campo = await screen.findByRole("textbox", { name: "Observações" });
    await userEvent.type(campo, "cliente VIP");
    // O clique no botão tira o foco do campo (blur) e depois clica.
    mutacao.mutate.mockImplementation(() => { mutacao.isPending = true; });
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mutacao.mutate).toHaveBeenCalledTimes(1);
    expect(mutacao.mutate.mock.calls[0]?.[0]).toEqual({ observacoes: "cliente VIP" });
  });

  it("o botão salva por si (sem depender do blur)", async () => {
    renderObs();
    const campo = await screen.findByRole("textbox", { name: "Observações" });
    await userEvent.type(campo, "x");
    // `fireEvent` não move o foco: só o clique do botão chama o salvar.
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(mutacao.mutate).toHaveBeenCalledTimes(1);
    expect(mutacao.mutate.mock.calls[0]?.[0]).toEqual({ observacoes: "x" });
  });

  it("sair do campo sem mudar nada não grava", async () => {
    salvo = "igual";
    renderObs();
    const campo = await screen.findByRole("textbox", { name: "Observações" });
    await userEvent.click(campo);
    await userEvent.tab();
    expect(mutacao.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("esvaziar e sair manda vazio (a rota apaga)", async () => {
    salvo = "antigo";
    renderObs();
    const campo = await screen.findByRole("textbox", { name: "Observações" });
    await userEvent.clear(campo);
    await userEvent.tab();
    expect(mutacao.mutate).toHaveBeenCalledWith({ observacoes: "" }, expect.anything());
  });
});

describe("observações do contato — leitura", () => {
  it("modo leitura: o texto sem campo nem botão", async () => {
    salvo = "não ligar de manhã";
    renderObs({ leitura: true });
    await waitFor(() => expect(screen.getByTestId("observacoes-somente-leitura")).toHaveTextContent("não ligar de manhã"));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
  });

  it("modo leitura sem observação diz que não há", async () => {
    renderObs({ leitura: true });
    await waitFor(() => expect(screen.getByTestId("observacoes-somente-leitura")).toHaveTextContent("Sem observações."));
  });

  it("anonimizado: nem consulta o contato, nem oferece campo", () => {
    renderObs({ anonimizado: true });
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("observacoes-somente-leitura")).toHaveTextContent("Sem observações.");
  });
});
