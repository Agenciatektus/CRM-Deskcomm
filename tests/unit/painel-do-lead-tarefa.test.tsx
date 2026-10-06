import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";

import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";
import {
  atalhoDisponivel,
  diasDaGrade,
  horarioDigitado,
  prazoDoAtalho,
} from "@/components/inbox/painel/prazos";
import { localeDeData } from "@/lib/i18n/datas";

/**
 * PRÓXIMO PASSO = TAREFA COM PRAZO (visual v2, fase 3.3).
 *
 * Guarda o CONTRATO com `/api/v1/tasks`, não a aparência: criar manda o título,
 * o prazo no fuso de quem olha, o responsável e os vínculos (contato e negócio
 * aberto); concluir e reagendar vão pelo PATCH da tarefa; e quem não grava vê a
 * tarefa sem os botões.
 */

const CONTACT = "c0000000-0000-4000-8000-000000000001";

const auth = vi.hoisted(() => ({ pode: true }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-1", support: null } }),
  usePermission: () => auth.pode,
}));

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/pipelines/useDefaultPipeline", () => ({ useDefaultPipeline: () => ({ data: null, isError: false }) }));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useUpdateConversationTags: () => ({ mutate: vi.fn(), isPending: false }),
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({ useContactTagVocabulary: () => ({ data: [] }) }));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({ useUpdateContact: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/contacts/RoteirosDoContato", () => ({ RoteirosDoContato: () => null }));

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: CONTACT,
  tags: [],
  contacts: { id: CONTACT, display_name: "Fulana", name: null, phone_number: "5511999", tags: [] },
} as unknown as React.ComponentProps<typeof CRMSidePanel>["conversation"];

const LEAD = {
  id: "l-1", title: "Negócio", status: "open", value_cents: null, currency: null,
  updated_at: "2026-10-01T00:00:00Z", pipeline_id: "p-1", stage_id: "s-1", custom_fields: {}, field_defs: [],
  funil_nome: "Vendas", etapa_nome: "Novo",
};

function tarefa(over: Record<string, unknown> = {}) {
  return {
    id: "t-1", organization_id: "org-1", title: "Mandar orçamento", description: null,
    due_date: new Date(Date.now() + 2 * 3_600_000).toISOString(), priority: "medium", status: "pending",
    lead_id: "l-1", contact_id: CONTACT, assigned_to: "u-1", created_by: "u-1",
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...over,
  };
}

let tarefas: unknown[] = [];
function responde(url: string) {
  if (url.includes("/crm-summary")) return Promise.resolve({ data: { leads: [LEAD], orders: [], activities: [], demandas: [], fatos: [], historico: [] } });
  if (url.startsWith("/api/v1/tasks")) return Promise.resolve({ data: { tasks: tarefas } });
  if (url.includes("/team/assignable")) return Promise.resolve({ data: [{ user_id: "u-1", role: "agent", full_name: "Paula" }, { user_id: "u-2", role: "agent", full_name: "Bruno" }] });
  return Promise.resolve({ data: {} });
}

function renderPainel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CRMSidePanel conversation={conversation} /></QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  auth.pode = true;
  tarefas = [];
  get.mockReset();
  get.mockImplementation(responde);
  post.mockReset();
  post.mockResolvedValue({ data: { task: tarefa() } });
  patch.mockReset();
  patch.mockResolvedValue({ data: { task: tarefa() } });
  toast.success.mockClear();
});

describe("próximo passo — criar", () => {
  it("sem tarefa aberta avisa, e cria pelo POST com título, prazo, responsável e vínculos", async () => {
    renderPainel();
    expect(await screen.findByTestId("sem-proximo-passo")).toHaveTextContent("Sem próximo passo");
    const form = await screen.findByTestId("nova-tarefa-rapida");
    const criar = within(form).getByRole("button", { name: "Criar tarefa" });

    await userEvent.click(within(form).getByRole("button", { name: "Ligar para o cliente" }));
    // Prazo é obrigatório nesta peça: sem "Quando" o botão não habilita.
    expect(criar).toBeDisabled();
    await userEvent.click(within(form).getByRole("button", { name: "Amanhã 9:00" }));
    await userEvent.selectOptions(within(form).getByLabelText("Responsável"), "u-2");
    await userEvent.click(criar);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [rota, corpo] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(rota).toBe("/api/v1/tasks");
    expect(corpo).toMatchObject({
      title: "Ligar para o cliente",
      due_date: prazoDoAtalho("amanha_9").toISOString(),
      assigned_to: "u-2",
      contact_id: CONTACT,
      lead_id: "l-1",
      status: "pending",
    });
  });

  it("'Escolher data' abre o calendário, e o dia e o horário escolhidos viram o prazo", async () => {
    renderPainel();
    const form = await screen.findByTestId("nova-tarefa-rapida");
    await userEvent.type(within(form).getByLabelText("O que fazer"), "Confirmar consulta");
    await userEvent.click(within(form).getByRole("button", { name: "Escolher data" }));

    const hoje = new Date();
    const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2);
    if (alvo.getMonth() !== hoje.getMonth()) await userEvent.click(within(form).getByRole("button", { name: "Próximo mês" }));
    await userEvent.click(within(form).getByRole("button", { name: format(alvo, "PPPP", { locale: localeDeData("pt-BR") }) }));
    await userEvent.click(within(form).getByRole("button", { name: "10:00" }));
    await userEvent.click(within(form).getByRole("button", { name: "Criar tarefa" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const esperado = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate(), 10, 0).toISOString();
    expect((post.mock.calls[0] as [string, { due_date: string; assigned_to: string }])[1]).toMatchObject({ due_date: esperado, assigned_to: "u-1" });
  });
});

describe("próximo passo — a tarefa aberta", () => {
  it("mostra título, prazo relativo e responsável; concluir grava done, SEM Desfazer", async () => {
    tarefas = [tarefa()];
    renderPainel();
    const card = await screen.findByTestId("tarefa-do-proximo-passo");
    expect(card).toHaveTextContent("Mandar orçamento");
    expect(card).toHaveTextContent("Responsável: Você");
    expect(card.textContent).toMatch(/em 2 horas/);

    await userEvent.click(within(card).getByRole("button", { name: "Concluir tarefa" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/tasks/t-1", { status: "done" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tarefa concluída."));
    // Sem Desfazer (revisão do @Cassio_SecRev, P3): concluir grava
    // `task_completed` na timeline do negócio, e reabrir deixaria essa linha
    // contando uma conclusão que não valeu.
    expect(toast.success.mock.calls[0]).toHaveLength(1);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("reagendar troca só o prazo, pelo PATCH da tarefa", async () => {
    tarefas = [tarefa()];
    renderPainel();
    const card = await screen.findByTestId("tarefa-do-proximo-passo");
    await userEvent.click(within(card).getByRole("button", { name: "Reagendar" }));
    const salvar = within(card).getByRole("button", { name: "Salvar novo prazo" });
    expect(salvar).toBeDisabled();
    await userEvent.click(within(card).getByRole("button", { name: "Em 3 dias 9:00" }));
    await userEvent.click(salvar);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/tasks/t-1", { due_date: prazoDoAtalho("em_3_dias_9").toISOString() }),
    );
  });

  it("tarefa com prazo vencido diz 'Atrasada' por escrito", async () => {
    tarefas = [tarefa({ due_date: new Date(Date.now() - 3 * 86_400_000).toISOString() })];
    renderPainel();
    expect(await screen.findByTestId("tarefa-do-proximo-passo")).toHaveTextContent("Atrasada");
  });

  it("em modo leitura a tarefa aparece, sem concluir nem reagendar", async () => {
    auth.pode = false;
    tarefas = [tarefa()];
    renderPainel();
    const card = await screen.findByTestId("tarefa-do-proximo-passo");
    expect(card).toHaveTextContent("Mandar orçamento");
    expect(within(card).queryByRole("button", { name: "Concluir tarefa" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Reagendar" })).toBeNull();
  });

  it("pergunta as tarefas abertas DO CONTATO", async () => {
    renderPainel();
    await screen.findByTestId("nova-tarefa-rapida");
    const urls = get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/v1/tasks"));
    expect(urls).toEqual([`/api/v1/tasks?contact_id=${CONTACT}&aberto=true`]);
  });
});

describe("prazos — a aritmética do 'Quando'", () => {
  const agora = new Date(2026, 9, 6, 19, 30);

  it("os atalhos caem no fuso de quem olha", () => {
    expect(prazoDoAtalho("hoje_18", agora)).toEqual(new Date(2026, 9, 6, 18, 0));
    expect(prazoDoAtalho("amanha_9", agora)).toEqual(new Date(2026, 9, 7, 9, 0));
    expect(prazoDoAtalho("em_3_dias_9", new Date(2026, 9, 30, 8))).toEqual(new Date(2026, 10, 2, 9, 0));
  });

  it("'Hoje 18:00' depois das 18h não é oferecido: nasceria atrasada", () => {
    expect(atalhoDisponivel("hoje_18", agora)).toBe(false);
    expect(atalhoDisponivel("hoje_18", new Date(2026, 9, 6, 9))).toBe(true);
  });

  it("horário digitado só vale em hh:mm", () => {
    expect(horarioDigitado("9:05")).toEqual([9, 5]);
    expect(horarioDigitado("24:00")).toBeNull();
    expect(horarioDigitado("9h")).toBeNull();
  });

  it("a grade do mês fecha em semanas inteiras, começando no domingo", () => {
    const dias = diasDaGrade(new Date(2026, 9, 1));
    expect(dias.length % 7).toBe(0);
    expect(dias[0]!.getDay()).toBe(0);
    expect(dias.some((d) => d.getMonth() === 9 && d.getDate() === 31)).toBe(true);
  });
});
