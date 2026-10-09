/**
 * Os itens POR ATENDENTE do menu (migration 9042) e os ícones da linha.
 * Hooks reais, rede falsa: o que se prova é a ROTA chamada.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { item, montar, rede } from "@/components/inbox/__fixtures__/bancada-do-menu";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const sessao = vi.hoisted(() => ({ pode: true, support: null as null | { access_mode: string } }));

vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: sessao.support } }),
  usePermission: () => sessao.pode,
}));

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  sessao.pode = true;
  sessao.support = null;
  rede(api);
});

async function abrir(extra: Partial<ConversationWithContact> = {}) {
  const { linha } = montar(extra);
  fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
  await waitFor(() => expect(document.activeElement?.getAttribute("role") ?? "").toMatch(/^menuitem/));
  return linha;
}

describe("itens por atendente no menu", () => {
  it("Fixar → POST /pin", async () => {
    await abrir();
    fireEvent.click(item("Fixar"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/pin", {}));
  });

  it("Desafixar numa conversa fixada → DELETE /pin", async () => {
    await abrir({ pinned: true });
    fireEvent.click(item("Desafixar"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/v1/conversations/conv-1/pin"));
  });

  it("Silenciar abre o submenu 8h / 1 semana / sempre, e cada um manda a sua duração", async () => {
    await abrir();
    fireEvent.keyDown(item("Silenciar"), { key: "ArrowRight" });
    const sub = await screen.findByRole("menu", { name: "Silenciar" });
    expect(within(sub).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "Por 8 horas",
      "Por 1 semana",
      "Sempre",
    ]);
    fireEvent.click(within(sub).getByRole("menuitem", { name: "Por 1 semana" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/mute", { duracao: "1w" }));
  });

  it("silenciada: o item vira Reativar som → DELETE /mute", async () => {
    await abrir({ muted_until: "infinity" });
    expect(screen.queryByRole("menuitem", { name: "Silenciar" })).toBeNull();
    fireEvent.click(item("Reativar som"));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/v1/conversations/conv-1/mute"));
  });

  it("Marcar como não lida → POST /mark-unread", async () => {
    await abrir();
    fireEvent.click(item("Marcar como não lida"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/mark-unread", {}));
  });

  it("Bloquear contato pede confirmação e só então POST /contacts/:id/block, com o motivo aparado", async () => {
    await abrir();
    fireEvent.click(item("Bloquear contato"));
    const janela = await screen.findByRole("alertdialog");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(within(janela).getByLabelText("Motivo (opcional)"), { target: { value: "  spam  " } });
    fireEvent.click(within(janela).getByRole("button", { name: "Bloquear" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/contacts\/.+\/block$/), { motivo: "spam" }),
    );
  });

  it("viewer (sem permissão de escrita): fixa/silencia/marca, mas NÃO vê Bloquear", async () => {
    sessao.pode = false;
    await abrir();
    expect(screen.getByRole("menuitem", { name: "Fixar" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Bloquear contato" })).toBeNull();
  });

  it("suporte somente leitura: nenhum item pessoal", async () => {
    sessao.support = { access_mode: "support_readonly" };
    await abrir();
    for (const nome of ["Fixar", "Silenciar", "Marcar como não lida", "Bloquear contato"]) {
      expect(screen.queryByRole("menuitem", { name: nome })).toBeNull();
    }
  });
});

describe("ícones da linha", () => {
  it("fixada e silenciada mostram os dois ícones; sem estado, nenhum", () => {
    montar({ pinned: true, muted_until: "infinity" });
    expect(screen.getByTestId("icone-fixada")).toBeInTheDocument();
    expect(screen.getByTestId("icone-silenciada")).toBeInTheDocument();
  });

  it("CONTROLE: sem estado (ou silêncio vencido), a linha fica como era", () => {
    montar({ pinned: false, muted_until: "2020-01-01T00:00:00Z" });
    expect(screen.queryByTestId("icone-fixada")).toBeNull();
    expect(screen.queryByTestId("icone-silenciada")).toBeNull();
  });

  it("marcada como não lida sem contador: a linha fica em negrito com o ponto, sem número", () => {
    const linha = montar({ unread_count_for_assignee: 0, marked_unread: true }).linha;
    expect(linha.getAttribute("data-nao-lida")).toBe("true");
    expect(within(linha).getByLabelText("Marcada como não lida").textContent).toBe("");
  });
});
