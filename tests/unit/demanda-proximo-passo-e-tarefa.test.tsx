import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";

/**
 * O "MARCAR PRÓXIMO PASSO" DA DEMANDA CRIA TAREFA (revisão do @Cassio_SecRev, P2).
 *
 * Havia duas verdades sobre o que fazer a seguir: o texto livre
 * `demandas.proximo_passo` e a tarefa do bloco Próximo passo. Decisão do
 * Peterson: próximo passo é TAREFA. Estes casos guardam que o botão da demanda
 * grava em `crm_tasks` (e não na demanda), que a falha não apaga o digitado, e
 * que o texto antigo continua visível, só como histórico.
 */

const CONTACT = "c0000000-0000-4000-8000-000000000001";

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: CONTACT,
  tags: [],
  contacts: { id: CONTACT, display_name: "Fulana", name: null, phone_number: "5511999", tags: [] },
} as unknown as React.ComponentProps<typeof CRMSidePanel>["conversation"];

const RESPOSTA = {
  leads: [{ id: "l-1", title: "Negócio", status: "open", value_cents: null, currency: null, updated_at: "2026-08-01T00:00:00Z" }],
  orders: [],
  activities: [],
  demandas: [
    { id: "d-1", aberta_em: new Date(Date.now() - 5 * 3_600_000).toISOString(), origem: "inbound", estado: "aberta", proximo_passo: null, proximo_passo_em: null, prazo_em: null },
    { id: "d-2", aberta_em: new Date(Date.now() - 2 * 3_600_000).toISOString(), origem: "handoff", estado: "em_atendimento", proximo_passo: "Ligar amanhã de manhã", proximo_passo_em: null, prazo_em: null },
  ],
};

const get = vi.fn();
const patch = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u-1", support: null } }), usePermission: () => true }));
vi.mock("@/hooks/pipelines/useDefaultPipeline", () => ({ useDefaultPipeline: () => ({ data: null, isError: false }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useUpdateConversationTags: () => ({ mutate: vi.fn(), isPending: false }),
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({ useContactTagVocabulary: () => ({ data: [] }) }));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({ useUpdateContact: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/contacts/RoteirosDoContato", () => ({ RoteirosDoContato: () => null }));

function renderPainel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CRMSidePanel conversation={conversation} /></QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  get.mockReset();
  patch.mockReset();
  post.mockReset();
});

describe("demanda — próximo passo é tarefa", () => {
  it("depois de criar a tarefa, a demanda deixa de dizer 'sem próximo passo'", async () => {
    // O banco do dublê: tarefas abertas do contato, que o POST passa a conter.
    let tarefas: unknown[] = [];
    get.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith("/api/v1/tasks") ? { data: { tasks: tarefas } } : { data: RESPOSTA }),
    );
    post.mockImplementation(() => {
      tarefas = [{ id: "t-1", title: "Ligar", due_date: new Date(Date.now() + 86_400_000).toISOString(), status: "pending", assigned_to: "u-1" }];
      return Promise.resolve({ data: { task: tarefas[0] } });
    });
    renderPainel();
    const sem = await screen.findByTestId("demanda-sem-proximo-passo");
    await userEvent.click(within(sem).getByTestId("marcar-proximo-passo"));
    const form = within(sem).getByTestId("nova-tarefa-rapida");
    await userEvent.type(within(form).getByLabelText("O que fazer"), "Ligar");
    await userEvent.click(within(form).getByRole("button", { name: "Amanhã 9:00" }));
    await userEvent.click(within(form).getByRole("button", { name: "Criar tarefa" }));

    // Sem leitura por demanda: a MESMA lista do contato, relida pela invalidação.
    await waitFor(() => expect(screen.queryByTestId("demanda-sem-proximo-passo")).toBeNull());
    expect(screen.getAllByTestId("demanda-com-proximo-passo")).toHaveLength(2);
    expect(screen.getByText("Próximo passo nas tarefas do contato")).toBeTruthy();
    const leiturasDeTarefa = get.mock.calls.filter(([u]) => String(u).startsWith("/api/v1/tasks")).length;
    expect(leiturasDeTarefa).toBe(2);
  });

  /**
   * Próximo passo é TAREFA (decisão do Peterson, revisão do @Cassio_SecRev): o
   * botão da demanda abre a criação da tarefa do contato e NÃO grava mais o
   * texto livre `demandas.proximo_passo`. Era o que este caso media antes (o
   * PATCH na demanda); agora mede que a escrita vai para `crm_tasks` e que a
   * demanda não é tocada.
   */
  it("marcar o próximo passo cria a TAREFA do contato, e não grava texto na demanda", async () => {
    get.mockResolvedValue({ data: RESPOSTA });
    post.mockResolvedValue({ data: { task: { id: "t-1" } } });
    renderPainel();
    const sem = await screen.findByTestId("demanda-sem-proximo-passo");

    await userEvent.click(within(sem).getByTestId("marcar-proximo-passo"));
    const form = within(sem).getByTestId("nova-tarefa-rapida");
    await userEvent.type(within(form).getByLabelText("O que fazer"), "Enviar a segunda via do boleto");
    await userEvent.click(within(form).getByRole("button", { name: "Amanhã 9:00" }));
    await userEvent.click(within(form).getByRole("button", { name: "Criar tarefa" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [rota, corpo] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(rota).toBe("/api/v1/tasks");
    expect(corpo).toMatchObject({ title: "Enviar a segunda via do boleto", contact_id: CONTACT, lead_id: "l-1" });
    expect(patch).not.toHaveBeenCalled();
  });

  it("falha ao criar NÃO fecha o formulário — o texto não pode evaporar", async () => {
    get.mockResolvedValue({ data: RESPOSTA });
    post.mockRejectedValueOnce(new Error("500"));
    renderPainel();
    const sem = await screen.findByTestId("demanda-sem-proximo-passo");
    await userEvent.click(within(sem).getByTestId("marcar-proximo-passo"));
    const form = within(sem).getByTestId("nova-tarefa-rapida");
    await userEvent.type(within(form).getByLabelText("O que fazer"), "Ligar amanhã");
    await userEvent.click(within(form).getByRole("button", { name: "Amanhã 9:00" }));
    await userEvent.click(within(form).getByRole("button", { name: "Criar tarefa" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    // Fechar devolveria a tela ao estado de sucesso com nada gravado.
    expect((within(sem).getByLabelText("O que fazer") as HTMLInputElement).value).toBe("Ligar amanhã");
  });

  it("o próximo passo antigo da demanda aparece só como histórico, sem campo para editar", async () => {
    get.mockResolvedValue({ data: RESPOSTA });
    renderPainel();
    const com = await screen.findByTestId("demanda-com-proximo-passo");
    expect(com.textContent).toMatch(/Combinado antes: Ligar amanhã de manhã/);
    expect(within(com).queryByRole("textbox")).toBeNull();
  });
});
