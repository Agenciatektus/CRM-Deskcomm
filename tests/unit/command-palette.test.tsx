/**
 * ⌘K. Começou como a saída de emergência para quem não achava uma TELA; na fase
 * 5 do visual v2 virou a busca geral do protótipo (T6-T10): contatos e
 * conversas pelas rotas que já aceitam `search`, ações e telas, numa lista
 * agrupada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CommandPalette } from "@/components/shell/CommandPalette";
import { termoParaServidor } from "@/components/shell/paleta/busca-remota";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import type * as InterfaceDoMenu from "@/lib/navigation/interface";

type ModuloDeInterface = typeof InterfaceDoMenu;

const push = vi.fn();
const get = vi.hoisted(() => vi.fn());
const setTheme = vi.fn();
const mutate = vi.fn();
const authRef: { user: Pick<AuthUser, "is_platform_admin"> & { id: string }; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false, id: "u-1" },
  activeOrg: { orgId: "org-1", name: "Org", role: "admin" },
};
let parametros = new URLSearchParams();
let caminho = "/app/radar";

vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => authRef }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => caminho,
  useSearchParams: () => parametros,
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get } }));
const semDestinos = vi.hoisted(() => ({ hrefs: [] as string[] }));
vi.mock("@/lib/navigation/interface", async (original) => {
  const real = await original<ModuloDeInterface>();
  return {
    ...real,
    destinosDaInterface: (...args: Parameters<ModuloDeInterface["destinosDaInterface"]>) =>
      real.destinosDaInterface(...args).filter((d) => !semDestinos.hrefs.includes(d.href)),
  };
});
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme }) }));
vi.mock("@/hooks/team/useAttendants", () => ({
  useMinhaDisponibilidade: () => ({ isSuccess: true, data: { data: { is_available: true } } }),
  useUpdateAvailability: () => ({ mutate }),
}));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  push.mockClear();
  setTheme.mockClear();
  mutate.mockClear();
  comoPapel("admin");
  parametros = new URLSearchParams();
  caminho = "/app/radar";
  semDestinos.hrefs = [];
});

function abrir() {
  return render(<CommandPalette open onOpenChange={() => {}} />);
}

const opcoesDoGrupo = (nome: string) =>
  [...screen.getByRole("group", { name: nome }).querySelectorAll('[role="option"]')] as HTMLElement[];

describe("CommandPalette: telas", () => {
  it("acha uma tela que o sidebar não mostra", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "conhec");
    expect(screen.getByRole("option", { name: /Conhecimento/ })).toBeTruthy();
  });

  it("ignora acento, porque ninguém digita acento com pressa", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "orcamento");
    expect(screen.getByRole("option", { name: /Uso e orçamento/ })).toBeTruthy();
  });

  it("busca também na descrição, não só no rótulo", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "esfriou");
    expect(screen.getByRole("option", { name: /Radar/ })).toBeTruthy();
  });

  it("entende os apelidos do protótipo (kanban, qr code)", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "qr code");
    expect(screen.getByRole("option", { name: /Conexões/ })).toBeTruthy();
  });

  it("acha o Jev pelo nome, e ele aparece no começo da descrição", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "jev");
    const opcao = screen.getByRole("option", { name: /Provedores/ });
    const descricao = opcao.querySelector("p")!.textContent!;
    expect(descricao.indexOf("Jev"), descricao).toBeGreaterThanOrEqual(0);
    expect(descricao.indexOf("Jev"), "o Jev tem de vir no começo").toBeLessThan(20);
  });

  it("o destaque é neutro (o `.pal-item.on` do protótipo) e o texto de apoio segue legível", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "jev");
    const destacada = screen.getByRole("option", { selected: true });
    expect(destacada.className).toContain("bg-surface-elevated");
    expect(destacada.querySelector("p")!.className).toContain("text-text-muted");
  });

  it("respeita o papel", async () => {
    comoPapel("agent");
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "audit");
    expect(screen.queryByRole("option", { name: /Audit Log/ })).toBeNull();
  });

  it("Enter navega para o item destacado", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "conhec");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/ai/knowledge/sources");
  });

  it("seta para baixo move o destaque antes do Enter", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "funi");
    await user.keyboard("{ArrowDown}{Enter}");
    const segundo = screen.getAllByRole("option")[1];
    expect(segundo?.getAttribute("data-href")).toBeTruthy();
    expect(push).toHaveBeenCalledWith(segundo?.getAttribute("data-href"));
  });

  it("diz quando não achou, com a dica", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "zzzzzz");
    await waitFor(() => expect(screen.getByText(/Nada encontrado para/i)).toBeTruthy());
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/parte do telefone/)).toBeTruthy();
  });
});

describe("CommandPalette: grupos e ações", () => {
  it("sem termo: ações (até 3) e as 4 primeiras telas, começando pela Inbox", () => {
    abrir();
    expect(opcoesDoGrupo("Ações").length).toBeLessThanOrEqual(3);
    const telas = opcoesDoGrupo("Telas");
    expect(telas).toHaveLength(4);
    expect(telas[0]?.getAttribute("data-href")).toBe("/app/inbox");
  });

  it("Criar próximo passo só aparece com uma conversa aberta na Inbox", () => {
    const { unmount } = abrir();
    expect(screen.queryByRole("option", { name: /Criar próximo passo/ })).toBeNull();
    unmount();
    caminho = "/app/inbox";
    parametros = new URLSearchParams("id=c-1");
    abrir();
    expect(screen.getByRole("option", { name: /Criar próximo passo/ })).toBeTruthy();
  });

  it("trocar o tema e ficar ausente executam de verdade", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole("option", { name: /Usar tema claro/ }));
    expect(setTheme).toHaveBeenCalledWith("light");
    cleanup();
    abrir();
    await user.type(screen.getByRole("combobox"), "ausente");
    await user.keyboard("{Enter}");
    expect(mutate).toHaveBeenCalledWith({ userId: "u-1", patch: { is_available: false } });
  });

  it("Ver avisos em aberto pede ao sino que abra o popover", async () => {
    const ouvinte = vi.fn();
    window.addEventListener("crm:abrir-avisos", ouvinte);
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "avisos em aberto");
    await user.keyboard("{Enter}");
    expect(ouvinte).toHaveBeenCalledTimes(1);
    window.removeEventListener("crm:abrir-avisos", ouvinte);
  });
});

describe("CommandPalette: contatos e conversas", () => {
  it("busca pela rota de conversas e abre a fechada na aba Fechadas", async () => {
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.startsWith("/api/v1/conversations")
          ? [{ id: "c-9", status: "closed", contacts: { id: "k-1", display_name: "Mariana Couto", phone_number: "5521998124410" } }]
          : [],
      }),
    );
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "mariana");
    const opcao = await screen.findByRole("option", { name: /Mariana Couto/ });
    expect(screen.getByRole("group", { name: "Contatos e conversas" }).contains(opcao)).toBe(true);
    await user.click(opcao);
    expect(push).toHaveBeenCalledWith("/app/inbox?filter=closed&id=c-9");
  });

  it("espera a pessoa parar de digitar: só o termo final vai ao servidor", async () => {
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "mariana");
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes("search=mariana"))).toBe(true));
    const comBusca = get.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("search="));
    expect(comBusca.every((u) => u.includes("search=mariana")), comBusca.join("\n")).toBe(true);
  });

  it("com menos de 2 letras não pergunta ao servidor", async () => {
    const user = userEvent.setup();
    abrir();
    get.mockClear();
    await user.type(screen.getByRole("combobox"), "m");
    await new Promise((r) => setTimeout(r, 350));
    expect(get.mock.calls.filter(([u]) => String(u).includes("search="))).toHaveLength(0);
  });

  it("sem Contatos no menu do vínculo, não pergunta à rota de contatos; sem Inbox, nem à de conversas", async () => {
    semDestinos.hrefs = ["/app/contacts"];
    const user = userEvent.setup();
    abrir();
    await user.type(screen.getByRole("combobox"), "mariana");
    await waitFor(() => expect(get.mock.calls.some(([u]) => String(u).includes("/conversations?search="))).toBe(true));
    expect(get.mock.calls.some(([u]) => String(u).startsWith("/api/v1/contacts"))).toBe(false);
    cleanup();
    get.mockClear();
    semDestinos.hrefs = ["/app/contacts", "/app/inbox"];
    abrir();
    await user.type(screen.getByRole("combobox"), "mariana");
    await new Promise((r) => setTimeout(r, 350));
    expect(get).not.toHaveBeenCalled();
  });

  it("o campo não aceita termo além do teto das rotas (100)", () => {
    abrir();
    expect(screen.getByRole("combobox")).toHaveAttribute("maxLength", "100");
  });

  it("telefone com máscara vai como dígitos", () => {
    expect(termoParaServidor("(21) 99812-4410")).toBe("21998124410");
    expect(termoParaServidor("+55 21 99812")).toBe("552199812");
    expect(termoParaServidor("Maria 21")).toBe("Maria 21");
  });
});
