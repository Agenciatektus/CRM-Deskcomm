import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentInboxItem } from "@/hooks/ai/useAgentInbox";

const estado = vi.hoisted(() => ({
  abertos: [] as AgentInboxItem[],
  resolvidos: [] as AgentInboxItem[],
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
  useUpdateInboxItem: () => ({ mutate: estado.mutate, isPending: false, isError: false }),
  useResolveAllInboxItems: () => ({ mutate: estado.resolverTodos, isPending: false, isError: false }),
}));

const avisos = vi.hoisted(() => ({ comDesfazer: vi.fn(), sucesso: vi.fn() }));
vi.mock("@/lib/ui/aviso-com-desfazer", () => ({ avisarComDesfazer: avisos.comDesfazer }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: avisos.sucesso, error: vi.fn() }) }));

import { CentralDeAvisos } from "./CentralDeAvisos";

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
    destination: { estado: "disponivel", href: "/app/inbox?id=c1", rotulo: "Abrir conversa" },
    ...extra,
  } as AgentInboxItem;
}

beforeEach(() => {
  estado.abertos = [aviso("a1"), aviso("a2")];
  estado.resolvidos = [aviso("r1", { status: "resolved" })];
  estado.mutate.mockReset();
  estado.resolverTodos.mockReset();
  avisos.comDesfazer.mockReset();
  avisos.sucesso.mockReset();
});

/** Roda o `onSuccess` que o componente passou ao resolver em lote. */
function concluirResolverTodos() {
  const opcoes = estado.resolverTodos.mock.calls.at(-1)![1] as { onSuccess: () => void };
  opcoes.onSuccess();
}

describe("CentralDeAvisos (popover do sino)", () => {
  it("título, abas com contagem, ação do aviso e rodapé para a central completa", () => {
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Central de avisos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Abertos 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Resolvidos 1" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Abrir conversa" })[0]).toHaveAttribute("href", "/app/inbox?id=c1");
    expect(screen.getByRole("link", { name: "Abrir a central completa" })).toHaveAttribute("href", "/app/ai/inbox");
  });

  it("✓ marca resolvido; Marcar todos resolve em lote", () => {
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Marcar resolvido" })[0]!);
    expect(estado.mutate).toHaveBeenCalledWith({ id: "a1", status: "resolved" });
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos resolvidos" }));
    expect(estado.resolverTodos).toHaveBeenCalled();
  });

  it("P2-3: lista completa (menos de 50) oferece Desfazer", () => {
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos resolvidos" }));
    concluirResolverTodos();
    expect(avisos.comDesfazer).toHaveBeenCalledTimes(1);
    expect(avisos.sucesso).not.toHaveBeenCalled();
  });

  it("P2-3: com 50 ou mais abertos o Desfazer NÃO é oferecido (não reabriria os que não vieram)", () => {
    estado.abertos = Array.from({ length: 50 }, (_, i) => aviso(`a${i}`));
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar todos resolvidos" }));
    concluirResolverTodos();
    expect(avisos.comDesfazer).not.toHaveBeenCalled();
    expect(avisos.sucesso).toHaveBeenCalledWith("Avisos marcados como resolvidos.");
  });

  it("nos resolvidos, Reabrir devolve o aviso", () => {
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Resolvidos 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    expect(estado.mutate).toHaveBeenCalledWith({ id: "r1", status: "open" });
  });

  it("lista de resolvidos no limite da rota (50): a aba não inventa contagem", () => {
    estado.resolvidos = Array.from({ length: 50 }, (_, i) => aviso(`r${i}`, { status: "resolved" }));
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    expect(screen.getByRole("tab", { name: "Resolvidos" })).toBeInTheDocument();
  });

  it("sem permissão de resolver, nenhum botão de resolver", () => {
    render(<CentralDeAvisos podeResolver={false} onFechar={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Marcar resolvido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar todos resolvidos" })).toBeNull();
  });

  it("vazio: diz que não há aviso em aberto", () => {
    estado.abertos = [];
    render(<CentralDeAvisos podeResolver onFechar={() => undefined} />);
    expect(screen.getByText("Nenhum aviso em aberto")).toBeInTheDocument();
  });
});
