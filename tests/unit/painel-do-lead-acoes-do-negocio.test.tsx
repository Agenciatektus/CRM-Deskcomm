import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";

/**
 * AS AÇÕES DO NEGÓCIO NO PAINEL DA CONVERSA (visual v2, fase 3.4).
 *
 * Nenhuma regra nova: cada botão tem de chamar a MESMA porta que o quadro usa
 * (`/win`, a janela de perder com os motivos do funil, `/clone` pela janela de
 * outro funil, `/retomar`, PATCH do dono). O que se guarda aqui é essa ligação,
 * a confirmação antes do que não se desfaz e o "Desfazer" só onde ele é real.
 */

const CONTACT = "c0000000-0000-4000-8000-000000000001";

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

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
// As duas janelas têm teste próprio; aqui importa QUAL lead e QUAIS motivos chegam.
vi.mock("@/components/kanban/LoseLeadDialog", () => ({
  LoseLeadDialog: (p: { leadId: string; motivosDoFunil?: string[]; onOpenChange: (v: boolean) => void; aoConcluir?: () => void }) => (
    <div data-testid="janela-de-perder" data-lead={p.leadId}>
      <span data-testid="motivos">{(p.motivosDoFunil ?? []).join(",")}</span>
      <button type="button" onClick={() => p.onOpenChange(false)}>fecha-sem-gravar</button>
      <button type="button" onClick={() => { p.onOpenChange(false); p.aoConcluir?.(); }}>grava-e-fecha</button>
    </div>
  ),
}));
vi.mock("@/components/kanban/MoveToOtherPipelineDialog", () => ({
  MoveToOtherPipelineDialog: (p: { leadId: string; pipelineId: string }) => (
    <div data-testid="janela-de-outro-funil" data-lead={p.leadId} data-funil={p.pipelineId} />
  ),
}));

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: CONTACT,
  tags: [],
  contacts: { id: CONTACT, display_name: "Fulana", name: null, phone_number: "5511999", tags: [] },
} as unknown as React.ComponentProps<typeof CRMSidePanel>["conversation"];

function lead(over: Record<string, unknown> = {}) {
  return {
    id: "l-1", title: "Negócio", status: "open", value_cents: null, currency: null,
    updated_at: "2026-10-01T00:00:00Z", pipeline_id: "p-1", stage_id: "s-1", custom_fields: {}, field_defs: [],
    funil_nome: "Vendas", etapa_nome: "Novo", owner_user_id: "u-1", owner_agent_id: null,
    motivos_de_perda: ["Preço alto", "Sumiu"], ...over,
  };
}

let leads: unknown[] = [];
function responde(url: string) {
  if (url.includes("/crm-summary")) return Promise.resolve({ data: { leads, orders: [], activities: [], demandas: [], fatos: [], historico: [] } });
  if (url.startsWith("/api/v1/tasks")) return Promise.resolve({ data: { tasks: [] } });
  if (url.includes("/team/assignable")) return Promise.resolve({ data: [{ user_id: "u-1", role: "agent", full_name: "Paula" }, { user_id: "u-2", role: "agent", full_name: "Bruno" }] });
  return Promise.resolve({ data: {} });
}

async function abrirNegocios() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CRMSidePanel conversation={conversation} /></QueryClientProvider>);
  await userEvent.click(await screen.findByRole("tab", { name: "Negócios" }));
  return screen.findByTestId("inbox-acoes-do-negocio");
}

beforeEach(() => {
  window.localStorage.clear();
  auth.pode = true;
  leads = [lead()];
  get.mockReset();
  get.mockImplementation(responde);
  post.mockReset();
  post.mockResolvedValue({ data: lead({ status: "won" }) });
  patch.mockReset();
  patch.mockResolvedValue({ data: lead() });
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("ações do negócio — aberto", () => {
  it("Ganho pede confirmação; cancelar não chama rota, confirmar chama /win", async () => {
    const acoes = await abrirNegocios();
    await userEvent.click(within(acoes).getByRole("button", { name: "Ganho" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(within(acoes).getByRole("button", { name: "Ganho" }));
    const janela = await screen.findByRole("alertdialog");
    await userEvent.click(within(janela).getByRole("button", { name: "Marcar como ganho" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/leads/l-1/win", {}));
  });

  it("Perdido abre a janela de perder com os motivos DO FUNIL", async () => {
    const acoes = await abrirNegocios();
    await userEvent.click(within(acoes).getByRole("button", { name: "Perdido" }));
    const janela = await screen.findByTestId("janela-de-perder");
    expect(janela).toHaveAttribute("data-lead", "l-1");
    expect(within(janela).getByTestId("motivos").textContent).toBe("Preço alto,Sumiu");
    expect(post).not.toHaveBeenCalled();
  });

  it("cancelar a janela de perder não relê o resumo; gravar relê", async () => {
    const acoes = await abrirNegocios();
    const leituras = () => get.mock.calls.filter(([u]) => String(u).includes("/crm-summary")).length;
    const antes = leituras();

    await userEvent.click(within(acoes).getByRole("button", { name: "Perdido" }));
    await userEvent.click(screen.getByRole("button", { name: "fecha-sem-gravar" }));
    expect(screen.queryByTestId("janela-de-perder")).toBeNull();
    expect(leituras()).toBe(antes);

    await userEvent.click(within(acoes).getByRole("button", { name: "Perdido" }));
    await userEvent.click(screen.getByRole("button", { name: "grava-e-fecha" }));
    await waitFor(() => expect(leituras()).toBe(antes + 1));
  });

  it("Outro funil abre a janela do clone para este negócio", async () => {
    const acoes = await abrirNegocios();
    await userEvent.click(within(acoes).getByRole("button", { name: "Outro funil" }));
    const janela = await screen.findByTestId("janela-de-outro-funil");
    expect(janela).toHaveAttribute("data-lead", "l-1");
    expect(janela).toHaveAttribute("data-funil", "p-1");
  });

  it("trocar o responsável grava owner_user_id, e o Desfazer devolve ao dono anterior", async () => {
    await abrirNegocios();
    const user = userEvent.setup();
    const seletor = await screen.findByRole("combobox", { name: "Responsável pelo negócio" });
    await waitFor(() => expect(seletor.textContent).toContain("Paula"));
    await user.click(seletor);
    await user.click(await screen.findByRole("option", { name: "Bruno" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/leads/l-1", { owner_user_id: "u-2" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [, opcoes] = toast.success.mock.calls.at(-1) as [string, { action: { label: string; onClick: () => void } }];
    expect(opcoes.action.label).toBe("Desfazer");
    // O banco agora diz Bruno (o que acabamos de gravar): o Desfazer pode devolver.
    leads = [lead({ owner_user_id: "u-2" })];
    opcoes.action.onClick();
    await waitFor(() => expect(patch).toHaveBeenLastCalledWith("/api/v1/leads/l-1", { owner_user_id: "u-1" }));
  });

  it("Desfazer NÃO sobrescreve quem outra pessoa escolheu depois", async () => {
    await abrirNegocios();
    const user = userEvent.setup();
    const seletor = await screen.findByRole("combobox", { name: "Responsável pelo negócio" });
    await waitFor(() => expect(seletor.textContent).toContain("Paula"));
    await user.click(seletor);
    await user.click(await screen.findByRole("option", { name: "Bruno" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [, opcoes] = toast.success.mock.calls.at(-1) as [string, { action: { onClick: () => void } }];

    // Entre a troca e o clique em Desfazer, outra pessoa passou o negócio a u-3.
    leads = [lead({ owner_user_id: "u-3" })];
    opcoes.action.onClick();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O responsável mudou de novo depois da sua troca. Nada foi desfeito."));
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

describe("ações do negócio — encerrado e leitura", () => {
  it("perdido mostra o motivo; Reabrir confirma e chama /retomar, sem Ganho/Perdido", async () => {
    leads = [lead({ status: "lost", lost_reason: "price" })];
    post.mockResolvedValue({ data: { lead: lead({ id: "l-2" }) } });
    const acoes = await abrirNegocios();
    expect(acoes).toHaveTextContent("Perdido: Preço");
    expect(within(acoes).queryByRole("button", { name: "Ganho" })).toBeNull();

    await userEvent.click(within(acoes).getByRole("button", { name: "Reabrir" }));
    const janela = await screen.findByRole("alertdialog");
    await userEvent.click(within(janela).getByRole("button", { name: "Reabrir" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/leads/l-1/retomar", {}));
  });

  it("sem permissão de gravar não há ação, e o responsável é só texto", async () => {
    auth.pode = false;
    const acoes = await abrirNegocios();
    expect(within(acoes).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Responsável pelo negócio" })).toBeNull();
    expect(screen.getByTestId("inbox-responsavel-somente-leitura")).toBeTruthy();
  });
});
