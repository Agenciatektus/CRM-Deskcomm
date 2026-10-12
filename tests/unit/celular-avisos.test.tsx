import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentInboxItem } from "@/hooks/ai/useAgentInbox";

/**
 * M3.3: a aba Avisos do celular, com as fontes, as ações e a régua de papel da central
 * do sino (`useCentralDeAvisos`). Abertos e Resolvidos com contagem; ícone por tipo;
 * destino do aviso, Compareceu/Faltou/Remarcou, Marcar resolvido e Reabrir; e o
 * "Marcar todos resolvidos" do ⋯, só com a lista completa, com Desfazer.
 */
const estado = vi.hoisted(() => ({
  abertos: [] as AgentInboxItem[],
  resolvidos: [] as AgentInboxItem[],
  papel: "agent",
  mutate: vi.fn(),
  resolverTodos: vi.fn(),
}));

vi.mock("@/hooks/ai/useAgentInbox", () => ({
  useAgentInbox: (status: "open" | "resolved") => ({
    isLoading: false,
    isError: false,
    data:
      status === "open"
        ? { items: estado.abertos, open_count: estado.abertos.length }
        : { items: estado.resolvidos, open_count: estado.abertos.length },
  }),
  useUpdateInboxItem: () => ({ mutate: estado.mutate, mutateAsync: vi.fn(), isPending: false, isError: false }),
  useResolveAllInboxItems: () => ({ mutate: estado.resolverTodos, isPending: false, isError: false }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => ({ activeOrg: { role: estado.papel } }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
const avisos = vi.hoisted(() => ({ comDesfazer: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/lib/ui/aviso-com-desfazer", () => ({ avisarComDesfazer: avisos.comDesfazer }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: avisos.sucesso, error: vi.fn() }) }));
vi.mock("@/components/shell/ResultadoDoCompromisso", () => ({
  ResultadoDoCompromisso: ({ compromissoId }: { compromissoId: string }) => (
    <div data-testid="resultado-do-compromisso">
      <button type="button">Compareceu</button>
      <button type="button">Faltou</button>
      <a href={`/app/agenda?id=${compromissoId}`}>Remarcou</a>
    </div>
  ),
}));
vi.mock("@/components/mobile/FolhaInferior", () => ({
  FolhaInferior: ({ aberto, children }: { aberto: boolean; children: React.ReactNode }) => (aberto ? <div role="dialog">{children}</div> : null),
  ItemDaFolha: ({ titulo, aoTocar }: { titulo: string; aoTocar: () => void }) => (
    <button type="button" onClick={aoTocar}>
      {titulo}
    </button>
  ),
}));

import { AcoesDosAvisos, AvisosNoCelular } from "@/components/mobile/telas/Avisos";

function aviso(id: string, extra: Partial<AgentInboxItem> = {}): AgentInboxItem {
  return {
    id,
    kind: "handoff",
    severity: "warn",
    title: `Aviso ${id}`,
    body: "Detalhe do aviso",
    ref_kind: null,
    ref_id: null,
    status: "open",
    created_at: new Date().toISOString(),
    destination: { estado: "disponivel", href: "/app/inbox?id=c1", rotulo: "Assumir" },
    ...extra,
  } as AgentInboxItem;
}

beforeEach(() => {
  estado.abertos = [aviso("a1"), aviso("a2", { kind: "appointment_outcome_required", ref_kind: "appointment", ref_id: "ag-1" })];
  estado.resolvidos = [aviso("r1", { status: "resolved" })];
  estado.papel = "agent";
  estado.mutate.mockReset();
  estado.resolverTodos.mockReset();
  avisos.comDesfazer.mockReset();
  avisos.sucesso.mockReset();
});

describe("Avisos no celular", () => {
  it("abas Abertos e Resolvidos com contagem; cartão com destino (Assumir) e Marcar resolvido", () => {
    render(<AvisosNoCelular />);
    expect(screen.getByRole("tab", { name: "Abertos (2)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Resolvidos (1)" })).toBeInTheDocument();
    const [primeiro] = screen.getAllByTestId("aviso-do-celular");
    expect(within(primeiro!).getByRole("link", { name: "Assumir" })).toHaveAttribute("href", "/app/inbox?id=c1");
    fireEvent.click(within(primeiro!).getByRole("button", { name: "Marcar resolvido" }));
    expect(estado.mutate).toHaveBeenCalledWith({ id: "a1", status: "resolved" });
  });

  it("aviso de compromisso traz Compareceu, Faltou e Remarcou no lugar do destino", () => {
    render(<AvisosNoCelular />);
    const segundo = screen.getAllByTestId("aviso-do-celular")[1]!;
    expect(within(segundo).getByRole("button", { name: "Compareceu" })).toBeInTheDocument();
    expect(within(segundo).getByRole("button", { name: "Faltou" })).toBeInTheDocument();
    expect(within(segundo).getByRole("link", { name: "Remarcou" })).toBeInTheDocument();
  });

  it("nos Resolvidos, Reabrir devolve o aviso", () => {
    render(<AvisosNoCelular />);
    fireEvent.click(screen.getByRole("tab", { name: "Resolvidos (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    expect(estado.mutate).toHaveBeenCalledWith({ id: "r1", status: "open" });
  });

  it("viewer não vê ações de resolver nem o desfecho do compromisso", () => {
    estado.papel = "viewer";
    render(<AvisosNoCelular />);
    expect(screen.queryByRole("button", { name: "Marcar resolvido" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("resultado-do-compromisso")).not.toBeInTheDocument();
  });
});

describe("⋯ de Avisos: Marcar todos resolvidos", () => {
  it("lista completa: resolve em lote e oferece Desfazer", () => {
    render(<AcoesDosAvisos />);
    fireEvent.click(screen.getByRole("button", { name: "Ações dos avisos" }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos resolvidos" }));
    expect(estado.resolverTodos).toHaveBeenCalledTimes(1);
    (estado.resolverTodos.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess();
    expect(avisos.comDesfazer).toHaveBeenCalledTimes(1);
  });

  it("⭐ lista no limite da rota (50): o ⋯ não aparece, porque o Desfazer não reabriria tudo", () => {
    estado.abertos = Array.from({ length: 50 }, (_, i) => aviso(`a${i}`));
    render(<AcoesDosAvisos />);
    expect(screen.queryByRole("button", { name: "Ações dos avisos" })).not.toBeInTheDocument();
  });

  it("viewer não vê o ⋯; com um aviso só, também não", () => {
    estado.papel = "viewer";
    const { unmount } = render(<AcoesDosAvisos />);
    expect(screen.queryByRole("button", { name: "Ações dos avisos" })).not.toBeInTheDocument();
    unmount();
    estado.papel = "agent";
    estado.abertos = [aviso("a1")];
    render(<AcoesDosAvisos />);
    expect(screen.queryByRole("button", { name: "Ações dos avisos" })).not.toBeInTheDocument();
  });
});
