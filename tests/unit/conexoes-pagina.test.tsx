/** A página de Conexões: KPIs, filtros, Galeria/Lista, ações pelo status e estados. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { ItemDeConexao } from "@/lib/channels/conexoes-lista";

const dados = vi.hoisted(() => ({
  itens: [] as unknown[],
  carregando: false,
  erro: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/hooks/channels/useConexoes", () => ({
  useConexoes: () => ({ ...dados, sessoes: [], nativoHabilitado: true }),
}));
vi.mock("@/hooks/channels/usePacingKnobs", () => ({ usePacingKnobs: () => ({ data: { items: [] } }) }));
vi.mock("@/components/connections/ChannelAiAccess", () => ({ ChannelAiAccess: () => <div data-testid="ia" /> }));
vi.mock("@/components/connections/AgendaDePausa", () => ({ AgendaDePausa: () => null }));
vi.mock("@/components/connections/ConnectionsClient", () => ({ ExcluirCanalDialog: () => null, QrDialog: () => null }));
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

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConexoesPagina wahaConfigured={false} wahaDesligado graphParceiro={null} />
    </QueryClientProvider>,
  );

const card = (id: string) => within(screen.getByTestId(`conexao-${id}`));

beforeEach(() => {
  dados.itens = [
    item("1"),
    item("2", { status: "STARTING", nativa: true, numero: null }),
    item("3", { status: "FAILED", nativa: true }),
    item("4", { pausado: true, metodo: "oficial" }),
  ];
  dados.carregando = false;
  dados.erro = false;
  window.localStorage.clear();
});
afterEach(cleanup);

describe("ConexoesPagina", () => {
  it("mostra os KPIs calculados dos dados", () => {
    montar();
    expect(screen.getByText("Conectados").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Precisam de atenção").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Total").nextElementSibling?.textContent).toBe("4");
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
    expect(card("3").queryByRole("button", { name: /Pausar/ })).toBeNull();
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
});
