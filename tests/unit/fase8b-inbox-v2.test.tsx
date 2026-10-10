/**
 * Visual v2, fase 8b. Um caso por item, cada um com o seu CONTROLE.
 *
 *   - motivo de perda opcional por funil (9044) no `FormularioDePerda`;
 *   - T18: Compareceu / Faltou no aviso do compromisso, pela rota existente;
 *   - B15: "Tentar de novo" some depois do clique e chama o reenvio;
 *   - H13: a origem do contato vira "Entrou por …".
 */
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormularioDePerda } from "@/components/kanban/LoseLeadDialog";
import { TentarDeNovo } from "@/components/inbox/bolha/TentarDeNovo";
import { ResultadoDoCompromisso } from "@/components/shell/ResultadoDoCompromisso";
import { entrouPor } from "@/lib/contacts/entrou-por";

const api = vi.hoisted(() => ({
  post: vi.fn(async (..._args: unknown[]) => ({ data: {} })),
  patch: vi.fn(async (..._args: unknown[]) => ({ data: {} })),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: api.post, patch: api.patch, get: vi.fn(async () => ({ data: {} })) },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/kanban/local-echo", () => ({ marcarEcoLocal: vi.fn(), liberarEcoLocal: vi.fn(), ehEcoLocal: () => false }));

function comQuery(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  api.post.mockClear();
  api.patch.mockClear();
});

describe("motivo de perda opcional por funil (9044)", () => {
  const formulario = (motivoObrigatorio?: boolean) =>
    comQuery(
      <FormularioDePerda
        leadId="lead-1"
        pipelineId="funil-1"
        motivosDoFunil={[]}
        motivoObrigatorio={motivoObrigatorio}
        onCancelar={() => {}}
        onConcluido={() => {}}
        rodape={(botoes) => <div>{botoes}</div>}
      />,
    );

  it("funil que dispensa: confirma sem escolher, e a rota recebe o pedido sem motivo", async () => {
    formulario(false);
    expect(screen.getByText("Motivo (opcional)")).toBeInTheDocument();
    const confirmar = screen.getByRole("button", { name: /Confirmar|Marcar como perdido/ });
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/leads/lead-1/lose", {}));
  });

  it("CONTROLE: sem a configuração (o padrão), o botão espera o motivo", () => {
    formulario();
    expect(screen.getByRole("button", { name: /Confirmar|Marcar como perdido/ })).toBeDisabled();
  });
});

describe("T18: o desfecho do compromisso no aviso", () => {
  it("Compareceu e Faltou usam o PATCH da agenda; Reagendar leva ao compromisso", async () => {
    comQuery(
      <ResultadoDoCompromisso compromissoId="ag-1" hrefDoCompromisso="/app/agenda?compromisso=ag-1" onNavegar={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compareceu" }));
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/agenda/agendamentos", { id: "ag-1", status: "completed" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Faltou" }));
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/agenda/agendamentos", { id: "ag-1", status: "no_show" }),
    );
    expect(screen.getByRole("link", { name: "Reagendar" })).toHaveAttribute("href", "/app/agenda?compromisso=ag-1");
  });

  it("CONTROLE: sem destino disponível, não há Reagendar", () => {
    comQuery(<ResultadoDoCompromisso compromissoId="ag-1" hrefDoCompromisso={null} onNavegar={() => {}} />);
    expect(screen.queryByRole("link", { name: "Reagendar" })).toBeNull();
  });
});

describe("B15: Tentar de novo", () => {
  it("chama o reenvio uma vez e some", () => {
    const reenviar = vi.fn();
    render(<TentarDeNovo onReenviar={reenviar} />);
    expect(screen.getByText("Não foi enviada.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(reenviar).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("tentar-de-novo")).toBeNull();
  });
});

describe("H13: de onde o contato veio", () => {
  it("anúncio com campanha, UTM cru, e a coluna source", () => {
    expect(entrouPor({ ad_platform: "meta_ads", campaign_name: "Clareamento" })).toEqual({
      rotulo: "Anúncio da Meta",
      traduzir: true,
      campanha: "Clareamento",
    });
    expect(entrouPor({ utm_source: "indicacao", utm_campaign: "outubro" })).toEqual({
      rotulo: "indicacao",
      traduzir: false,
      campanha: "outubro",
    });
    expect(entrouPor({ source: "import_csv" })?.rotulo).toBe("Importação");
    expect(entrouPor({ source: "lead_captures" })?.rotulo).toBe("Formulário");
  });

  it("CONTROLE: canal, manual e ausência não viram origem", () => {
    expect(entrouPor({ source: "whatsapp" })).toBeNull();
    expect(entrouPor({ source: "manual" })).toBeNull();
    expect(entrouPor(null)).toBeNull();
    expect(entrouPor({ ad_platform: "desconhecida" })).toBeNull();
  });
});
