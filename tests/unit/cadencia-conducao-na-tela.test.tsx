import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

/**
 * QUEM ATENDE QUANDO O LEAD RESPONDE, NA TELA.
 *
 *   1. o padrão é "Atendente" (sem campos de IA);
 *   2. escolher IA mostra agente, objetivo, etapa, instrução e modo, e o modo
 *      nasce ASSISTIDO (uma pessoa aprova antes de sair);
 *   3. a etapa que dispara a cadência e a de perda não são alvo;
 *   4. a instrução mostra o contador até 2000;
 *   5. no painel de revisão, a proposta de mover etapa aparece em texto legível.
 */
const traduzir = Object.assign((texto: string) => texto, { t: (texto: string) => texto });
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => traduzir }));

const agentes = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Sofia", is_active: true, archived_at: null, published_version_id: "v1" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Rascunho", is_active: true, archived_at: null, published_version_id: null },
];
vi.mock("@/hooks/ai/useAgents", () => ({ useAgentsList: () => ({ data: agentes, isLoading: false }) }));

const get = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { ConducaoDaResposta } from "@/components/cadencia/ConducaoDaResposta";
import { ReplyReviewPanel } from "@/components/inbox/composer/ReplyReviewPanel";
import type { ConducaoDaCadencia } from "@/lib/cadencia/conducao/settings";

const etapas = [
  { id: "e-gatilho", name: "Primeiro contato", is_lost: false },
  { id: "e-alvo", name: "Reunião marcada", is_lost: false },
  { id: "e-perdida", name: "Perdido", is_lost: true },
];

function renderizar(conducao: ConducaoDaCadencia, onChange = vi.fn()) {
  render(<ConducaoDaResposta conducao={conducao} onChange={onChange} etapas={etapas} etapaDoGatilho="e-gatilho" />);
  return onChange;
}

const conducaoIa: ConducaoDaCadencia = {
  quem_atende: "ia",
  agent_id: agentes[0]!.id,
  preset: "agendar_reuniao",
  etapa_alvo_id: "e-alvo",
  modo: "assistido",
};

describe("condução da resposta", () => {
  it("o padrão é Atendente, sem campos de IA", () => {
    renderizar({ quem_atende: "atendente" });
    expect(screen.getByRole("radio", { name: "Atendente" })).toBeChecked();
    expect(screen.queryByLabelText("Agente")).toBeNull();
    expect(screen.queryByLabelText("Instrução para a IA")).toBeNull();
  });

  it("escolher IA preenche agente publicado, etapa válida e modo assistido", () => {
    const onChange = renderizar({ quem_atende: "atendente" });
    fireEvent.click(screen.getByRole("radio", { name: "Agente de IA" }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual({
      quem_atende: "ia",
      agent_id: agentes[0]!.id,
      preset: "qualificar",
      etapa_alvo_id: "e-alvo",
      modo: "assistido",
    });
  });

  it("com IA, mostra agente, objetivo, etapa, instrução e modo (assistido marcado)", () => {
    renderizar(conducaoIa);
    const agente = screen.getByLabelText("Agente");
    const nomes = within(agente).getAllByRole("option").map((o) => o.textContent);
    expect(nomes).toContain("Sofia");
    expect(nomes).not.toContain("Rascunho");
    expect(screen.getByLabelText("Objetivo")).toHaveValue("agendar_reuniao");
    expect(screen.getByLabelText("Até qual etapa a IA conduz")).toHaveValue("e-alvo");
    expect(screen.getByLabelText("Instrução para a IA")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Assistido/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Automático/ })).not.toBeChecked();
  });

  it("etapa que dispara a cadência e etapa de perda não são alvo", () => {
    renderizar(conducaoIa);
    const opcoes = within(screen.getByLabelText("Até qual etapa a IA conduz"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opcoes).toContain("Reunião marcada");
    expect(opcoes).not.toContain("Primeiro contato");
    expect(opcoes).not.toContain("Perdido");
  });

  it("a instrução mostra o contador até 2000", () => {
    renderizar({ ...conducaoIa, instrucao: "Fale simples." });
    expect(screen.getByText("13/2000")).toBeInTheDocument();
    expect(screen.getByLabelText("Instrução para a IA")).toHaveAttribute("maxLength", "2000");
  });
});

describe("painel de revisão da resposta", () => {
  it("a proposta de mover etapa aparece em texto legível, não o id da ferramenta", async () => {
    get.mockResolvedValue({
      data: {
        drafts: [
          {
            id: "d1",
            revision: "1",
            status: "pending",
            original_body: "Oi!",
            edited_body: null,
            error_code: null,
            proposals: [{ tool: "crm_move_lead_stage", arguments: {} }],
          },
        ],
      },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ReplyReviewPanel conversationId="c1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Mover o negócio de etapa (confirme pelo painel do lead)")).toBeInTheDocument();
    expect(screen.queryByText("crm_move_lead_stage")).toBeNull();
  });
});
