/** A página de Conexões: KPIs, filtros, Galeria/Lista, ações pelo status e estados. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { ItemDeConexao } from "@/lib/channels/conexoes-lista";

const dados = vi.hoisted(() => ({
  itens: [] as unknown[],
  carregando: false,
  erro: false,
  bancoAtrasado: false,
  patch: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { patch: dados.patch, get: vi.fn(), post: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/hooks/channels/useConexoes", () => ({
  useConexoes: () => ({ ...dados, sessoes: [], nativoHabilitado: true }),
}));
vi.mock("@/hooks/channels/usePacingKnobs", () => ({ usePacingKnobs: () => ({ data: { items: [] } }) }));
vi.mock("@/components/connections/ChannelAiAccess", () => ({ ChannelAiAccess: () => <div data-testid="ia" /> }));
vi.mock("@/components/connections/AgendaDePausa", () => ({ AgendaDePausa: () => null }));
vi.mock("@/components/connections/ConnectionsClient", () => ({
  ExcluirCanalDialog: () => null,
  QrDialog: () => null,
  frasesDoLoteDePausa: () => ({ sucesso: "feito", erro: null }),
}));
vi.mock("@/components/connections/AntiBanSheet", () => ({ AntiBanSheet: () => null }));
vi.mock("@/components/connections/GruposSheet", () => ({ GruposSheet: () => null }));
vi.mock("@/components/connections/AssistenteConexao", () => ({ AssistenteConexao: () => null }));

import { ConexoesPagina } from "@/components/connections/ConexoesPagina";

const item = (id: string, o: Partial<ItemDeConexao> = {}): ItemDeConexao => ({
  id,
  fonte: "canal",
  tipo: "whatsapp",
  metodo: "qr",
  nome: `Canal ${id}`,
  nomeCru: `Canal ${id}`,
  numero: `+55 11 9000${id}`,
  status: "WORKING",
  pausado: false,
  nativa: false,
  viveNoTransporte: false,
  temGrupos: true,
  temModelos: false,
  mudouEm: null,
  sessao: null,
  ...o,
});

const montar = (p: { configurado?: boolean; desligado?: boolean } = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConexoesPagina wahaConfigured={p.configurado ?? false} wahaDesligado={p.desligado ?? true} graphParceiro={null} />
    </QueryClientProvider>,
  );

const card = (id: string) => within(screen.getByTestId(`conexao-${id}`));

beforeEach(() => {
  dados.itens = [
    item("1"),
    item("2", { status: "STARTING", nativa: true, numero: null }),
    item("3", { status: "FAILED", nativa: true }),
    item("4", { pausado: true, metodo: "oficial" }),
    item("5", { metodo: "oficial" }),
  ];
  dados.carregando = false;
  dados.erro = false;
  dados.bancoAtrasado = false;
  dados.patch.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("ConexoesPagina", () => {
  it("mostra os KPIs calculados dos dados", () => {
    montar();
    expect(screen.getByText("Conectados").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Precisam de atenção").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Total").nextElementSibling?.textContent).toBe("5");
  });

  it("ação pelo status: cada cartão tem as suas e não tem as dos outros", () => {
    montar();
    expect(card("1").getByRole("link", { name: /Abrir conversas/ })).toBeTruthy();
    expect(card("1").getByRole("button", { name: /Pausar/ })).toBeTruthy();
    expect(card("1").queryByRole("button", { name: "Continuar conexão" })).toBeNull();
    expect(card("2").getByRole("button", { name: "Continuar conexão" })).toBeTruthy();
    expect(card("2").getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(card("2").queryByRole("link", { name: /Abrir conversas/ })).toBeNull();
    expect(card("3").getByRole("button", { name: "Reconectar" })).toBeTruthy();
    expect(card("3").getByRole("button", { name: /Excluir/ })).toBeTruthy();
    expect(card("4").getByRole("button", { name: /Retomar/ })).toBeTruthy();
    expect(card("4").queryByRole("button", { name: /Pausar/ })).toBeNull();
  });

  it("filtra por busca e por tipo", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "Canal 3" } });
    expect(screen.queryByTestId("conexao-1")).toBeNull();
    expect(screen.getByTestId("conexao-3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Instagram" }));
    expect(screen.getByText("Nenhuma conexão com esses filtros.")).toBeTruthy();
  });

  it("Galeria é o padrão; Lista troca a vista, usa aria-pressed e persiste", () => {
    const { unmount } = montar();
    expect(screen.getByTestId("vista-galeria")).toBeTruthy();
    const lista = screen.getByRole("button", { name: "Lista" });
    expect(lista.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(lista);
    expect(screen.getByTestId("vista-lista")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lista" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("columnheader", { name: "Método" })).toBeTruthy();
    unmount();
    montar();
    expect(screen.getByTestId("vista-lista")).toBeTruthy();
  });

  it("com o armazenamento indisponível a página funciona e fica na Galeria", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    montar();
    expect(screen.getByTestId("vista-galeria")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByTestId("vista-lista")).toBeTruthy();
    get.mockRestore();
    set.mockRestore();
  });

  it("estado vazio, carregando e erro", () => {
    dados.itens = [];
    const vazio = montar();
    expect(screen.getByText("Nenhuma conexão ainda")).toBeTruthy();
    vazio.unmount();
    dados.carregando = true;
    const carregando = montar();
    expect(document.querySelector("[data-esqueleto]")).toBeTruthy();
    expect(screen.queryByText("Nenhuma conexão ainda")).toBeNull();
    carregando.unmount();
    dados.carregando = false;
    dados.erro = true;
    montar();
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível carregar");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(screen.queryByText("Nenhuma conexão ainda")).toBeNull();
  });

  it("Conectar abre a escolha de fluxo com WhatsApp, Instagram e Ligação", () => {
    montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Conectar" })[0]!);
    expect(screen.getByRole("button", { name: /WhatsApp/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ligação/ })).toBeTruthy();
  });

  it("restaurado: FAILED pode ser pausado; canal oficial conectado ganha Gerenciar (QR não)", () => {
    montar();
    expect(card("3").getByRole("button", { name: /Pausar/ })).toBeTruthy();
    expect(card("5").getByRole("link", { name: /Gerenciar/ }).getAttribute("href")).toBe("/app/connections?aba=oficial");
    expect(card("1").queryByRole("link", { name: /Gerenciar/ })).toBeNull();
  });

  it("restaurado: Pausar todas pede confirmação com a contagem e só então chama a rota de lote", async () => {
    dados.patch.mockResolvedValue({ data: {} });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Pausar todas (4)" }));
    expect(dados.patch).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("Pausar 4 canais?");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Pausar todas" }));
    await vi.waitFor(() => expect(dados.patch).toHaveBeenCalled());
    expect(dados.patch).toHaveBeenCalledWith("/api/v1/channel-sessions/disabled", {
      disabled: true,
      ids: ["1", "2", "3", "5"],
    });
  });

  it("restaurado: Retomar todas só aparece com canal pausado; Pausar todas some quando tudo está pausado", () => {
    montar();
    expect(screen.getByRole("button", { name: "Retomar todas (1)" })).toBeTruthy();
    cleanup();
    dados.itens = [item("9", { pausado: true })];
    montar();
    expect(screen.queryByRole("button", { name: /Pausar todas/ })).toBeNull();
  });

  it("restaurado: avisos de serviço fora do ar e banco atrasado, e o link dos responsáveis", () => {
    dados.itens = [item("1", { viveNoTransporte: true })];
    dados.bancoAtrasado = true;
    montar({ configurado: false, desligado: false });
    expect(screen.getByText("O serviço do WhatsApp por QR não está configurado.")).toBeTruthy();
    expect(screen.getByText("Esta instalação está com o banco atrasado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Configurar responsáveis por número" }).getAttribute("href")).toBe(
      "/app/settings/atendimento",
    );
    cleanup();
    dados.bancoAtrasado = false;
    montar({ configurado: false, desligado: true });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restaurado: Configurar IA também aparece na Lista, só para canal conectado", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    const tabela = within(screen.getByTestId("vista-lista").querySelector("table") as HTMLElement);
    expect(within(tabela.getByTestId("conexao-1").closest("tr") as HTMLElement).getByTestId("ia")).toBeTruthy();
    expect(within(tabela.getByTestId("conexao-3").closest("tr") as HTMLElement).queryByTestId("ia")).toBeNull();
  });
});
