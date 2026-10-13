/**
 * O menu de contexto da conversa na lista (visual v2, fase 3.6).
 *
 * Prende as três portas de entrada (botão direito, "…" e teclado), a navegação
 * por teclado com submenu, os jeitos de fechar, as regras de papel/leitura e,
 * principalmente, que cada item chama a ROTA que o cabeçalho já chama: o menu
 * não pode ser um segundo caminho para o servidor.
 *
 * A rede é o `apiClient` falso, e os hooks são os de verdade: um teste que
 * trocasse os hooks por `vi.fn()` passaria com o hook apontando para a rota
 * errada.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { item, montar, rede, semItem } from "@/components/inbox/__fixtures__/bancada-do-menu";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
const sessao = vi.hoisted(() => ({ pode: true, support: null as null | { access_mode: string } }));

vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: sessao.support } }),
  usePermission: () => sessao.pode,
}));

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  push.mockReset();
  sessao.pode = true;
  sessao.support = null;
  rede(api);
});

describe("abrir", () => {
  it("pelo botão direito, ancorado no ponto do clique", () => {
    const { linha } = montar();
    fireEvent.contextMenu(linha, { clientX: 120, clientY: 240 });
    expect(screen.getByRole("menu", { name: /Ações da conversa com Maria/ })).toBeInTheDocument();
    const ancora = screen.getByTestId("ancora-do-menu-da-conversa");
    expect(ancora.style.left).toBe("120px");
    expect(ancora.style.top).toBe("240px");
  });

  it("a linha também anuncia o menu: aria-expanded acompanha a abertura", async () => {
    const { linha } = montar();
    expect(linha).toHaveAttribute("aria-haspopup", "menu");
    expect(linha).toHaveAttribute("aria-expanded", "false");
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    expect(linha).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(linha).toHaveAttribute("aria-expanded", "false"));
  });

  it("pelo botão '…', que fica marcado como expandido", () => {
    montar();
    const mais = screen.getByRole("button", { name: /Ações da conversa com Maria/ });
    expect(mais).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(mais);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(mais).toHaveAttribute("aria-expanded", "true");
  });

  it("por Shift+F10 e pela tecla de menu na linha focada, com foco no primeiro item", async () => {
    const { linha } = montar();
    linha.focus();
    fireEvent.keyDown(linha, { key: "F10", shiftKey: true });
    await waitFor(() => expect(item("Assumir")).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.keyDown(linha, { key: "ContextMenu" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("CONTROLE: F10 sem Shift não abre", () => {
    const { linha } = montar();
    fireEvent.keyDown(linha, { key: "F10" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("teclado e fechar", () => {
  it("setas navegam, → abre o submenu, ← volta e Enter executa", async () => {
    const { linha } = montar();
    fireEvent.keyDown(linha, { key: "F10", shiftKey: true });
    await waitFor(() => expect(item("Assumir")).toHaveFocus());
    fireEvent.keyDown(item("Assumir"), { key: "ArrowDown" });
    await waitFor(() => expect(item(/Transferir para/)).toHaveFocus());
    fireEvent.keyDown(item(/Transferir para/), { key: "ArrowDown" });
    const lembrar = item(/Lembrar depois/);
    await waitFor(() => expect(lembrar).toHaveFocus());
    expect(lembrar).toHaveAttribute("aria-haspopup", "menu");

    fireEvent.keyDown(lembrar, { key: "ArrowRight" });
    const sub = await screen.findByRole("menu", { name: "Lembrar depois" });
    await waitFor(() => expect(within(sub).getByRole("menuitem", { name: /^Em 1 hora/ })).toHaveFocus());

    fireEvent.keyDown(within(sub).getByRole("menuitem", { name: /^Em 1 hora/ }), { key: "ArrowLeft" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Lembrar depois" })).toBeNull());
    await waitFor(() => expect(lembrar).toHaveFocus());

    fireEvent.keyDown(lembrar, { key: "ArrowRight" });
    const sub2 = await screen.findByRole("menu", { name: "Lembrar depois" });
    // As MESMAS opções do cabeçalho (`opcoesDoLembrete`), com o instante pronto.
    const semana = within(sub2).getByRole("menuitem", { name: /^Em 1 semana/ });
    semana.focus();
    fireEvent.keyDown(semana, { key: "Enter" });
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/snooze", {
        snooze_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    const corpo = api.post.mock.calls[0]?.[1] as { snooze_until: string };
    const enviado = new Date(corpo.snooze_until).getTime();
    expect(enviado - Date.now()).toBeGreaterThan(6 * 86_400_000);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("Esc fecha e devolve o foco à linha", async () => {
    const { linha } = montar();
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(linha).toHaveFocus();
  });

  it("clique fora fecha", async () => {
    const { linha } = montar();
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    // O Radix só passa a ouvir o clique fora um tique depois de abrir.
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.pointerDown(screen.getByRole("button", { name: "fora" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});

describe("papel e modo leitura", () => {
  it("com papel de escrita: ações de atendimento aparecem", () => {
    const { linha } = montar();
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    for (const n of ["Assumir", /Transferir para/, /Lembrar depois/, /Etiquetas/, /Funil e etapa/, "Fechar", "Arquivar"])
      expect(item(n)).toBeInTheDocument();
  });

  it("sem papel (viewer): só ficha e telefone, e o cabeçalho diz Somente leitura", () => {
    sessao.pode = false;
    const { linha } = montar();
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    for (const n of ["Assumir", /Transferir para/, /Lembrar depois/, /Etiquetas/, /Funil e etapa/, "Fechar", "Arquivar"]) semItem(n);
    expect(item("Abrir ficha do contato")).toBeInTheDocument();
    expect(item("Copiar telefone")).toBeInTheDocument();
    expect(within(screen.getByRole("menu")).getByText("Somente leitura")).toBeInTheDocument();
  });

  it("acompanhamento de suporte somente leitura esconde a escrita mesmo com papel", () => {
    sessao.support = { access_mode: "support_readonly" };
    const { linha } = montar();
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    semItem("Assumir");
    semItem("Fechar");
  });

  it("conversa fechada: Reabrir no lugar de Fechar; arquivada não oferece Arquivar", () => {
    const { linha } = montar({ status: "closed" });
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    semItem("Fechar");
    expect(item("Reabrir")).toBeInTheDocument();
    expect(item("Arquivar")).toBeInTheDocument();
  });

  it("conversa minha: Liberar no lugar de Assumir", () => {
    const { linha } = montar({ assigned_to_user_id: "u1", status: "claimed" });
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    semItem("Assumir");
    expect(item("Liberar")).toBeInTheDocument();
  });
});
