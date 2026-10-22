import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import type { Lead } from "@/lib/types/leads";

/**
 * "Adicionar à campanha" na barra em lote do Funil (fase 2): escolher uma
 * campanha em rascunho, ver quantos entram e quem fica de fora por quê, e só
 * então gravar. Controles: sem o papel o item não aparece; conferir não grava.
 */
const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const papel = vi.hoisted(() => ({ role: "manager" }));
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, patch: vi.fn() } }));
vi.mock("@/hooks/kanban/useBulkAction", () => ({
  useBulkAction: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "eu", is_platform_admin: false }),
  useActiveOrg: () => ({ role: papel.role }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
// Sem mock de `InscreverNaCadencia`: o componente saiu junto com a FEATURE
// cadência, e `vi.mock` com factory resolve o caminho — mock de módulo que não
// existe mais derruba a suíte na resolução.

const lead = (id: string) =>
  ({ id, stage_id: "s1", status: "open", owner_user_id: null, contact_id: `c-${id}`, tags: [] }) as unknown as Lead;

const CONFERENCIA = {
  entram: 2,
  gravado: false,
  fora: [
    { motivo: "opt_out", quantos: 1, texto: "Pediu para não receber mensagens" },
    { motivo: "sem_contato", quantos: 1, texto: "Negócio sem contato" },
  ],
};

function montar() {
  const onClear = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BulkActionBar
        selectedIds={["a", "b", "c", "d"]}
        stages={[{ id: "s1", name: "Novo", is_won: false, is_lost: false }] as never}
        pipelineId="p-1"
        tagsExistentes={[]}
        leads={[lead("a"), lead("b"), lead("c"), lead("d")]}
        funis={[]}
        ownerNames={new Map()}
        onClear={onClear}
        onRestaurar={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onClear;
}

beforeEach(() => {
  papel.role = "manager";
  post.mockReset();
  get.mockReset();
  toastSuccess.mockReset();
  get.mockResolvedValue({
    data: [
      { id: "camp-1", name: "Reativação outubro", status: "draft", entrada_continua: false },
      { id: "camp-2", name: "Contínua da etapa", status: "draft", entrada_continua: true },
    ],
  });
  post.mockImplementation(async (_url: string, corpo: { confirmar?: boolean }) => ({
    data: { ...CONFERENCIA, gravado: corpo.confirmar === true },
  }));
});

async function abrirDialogo() {
  await userEvent.click(screen.getByRole("button", { name: "Mais ações…" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Adicionar à campanha…" }));
  return screen.findByRole("dialog");
}

describe("Adicionar à campanha (barra em lote do Funil)", () => {
  it("⭐ escolher a campanha confere (sem gravar) e mostra quantos entram e quem fica de fora", async () => {
    montar();
    const caixa = await abrirDialogo();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/campaigns?status=draft&limit=100"));
    // A contínua não é oferecida: ela não recebe lista.
    const select = (await waitFor(() => {
      const s = caixa.querySelector("select");
      expect(s).toBeTruthy();
      return s;
    }))!;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "camp-1"]);

    fireEvent.change(select, { target: { value: "camp-1" } });
    const conferencia = await within(caixa).findByTestId("conferencia-da-campanha");
    expect(conferencia.textContent).toContain("2 contatos entram na campanha.");
    expect(conferencia.textContent).toContain("1: Pediu para não receber mensagens");
    expect(conferencia.textContent).toContain("1: Negócio sem contato");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/v1/campaigns/camp-1/incluir", { lead_ids: ["a", "b", "c", "d"] });
  });

  it("⭐ confirmar grava (confirmar: true), avisa e limpa a seleção", async () => {
    const onClear = montar();
    const caixa = await abrirDialogo();
    const select = (await waitFor(() => caixa.querySelector("select")!))!;
    fireEvent.change(select, { target: { value: "camp-1" } });
    await within(caixa).findByTestId("conferencia-da-campanha");
    await userEvent.click(within(caixa).getByRole("button", { name: "Adicionar" }));
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith("/api/v1/campaigns/camp-1/incluir", {
        lead_ids: ["a", "b", "c", "d"],
        confirmar: true,
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith("2 contatos adicionados à campanha.");
    expect(onClear).toHaveBeenCalled();
  });

  it("controle: ninguém entra, o Adicionar fica desabilitado", async () => {
    post.mockResolvedValue({ data: { entram: 0, gravado: false, fora: [{ motivo: "opt_out", quantos: 4, texto: "x" }] } });
    montar();
    const caixa = await abrirDialogo();
    const select = (await waitFor(() => caixa.querySelector("select")!))!;
    fireEvent.change(select, { target: { value: "camp-1" } });
    await within(caixa).findByTestId("conferencia-da-campanha");
    expect(within(caixa).getByRole("button", { name: "Adicionar" })).toBeDisabled();
  });

  it("controle: sem o papel (atendente), o item não aparece", async () => {
    papel.role = "agent";
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Mais ações…" }));
    await screen.findByRole("menuitem", { name: "Exportar CSV" });
    expect(screen.queryByRole("menuitem", { name: "Adicionar à campanha…" })).not.toBeInTheDocument();
  });
});
