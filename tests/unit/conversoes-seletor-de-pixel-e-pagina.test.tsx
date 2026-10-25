import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormularioDeConversoes } from "@/app/app/settings/conversoes/_form";
import { IdentidadeDaConversao } from "@/app/app/settings/conversoes/_identidadeDaMeta";
import { escolherValor } from "@/tests/unit/helpers/controles-do-ds";

const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: mock.get } }));
vi.mock("@/app/actions/settings/updateAdPlatformConnection", () => ({
  updateAdPlatformConnection: vi.fn(),
}));
vi.mock("@/app/actions/settings/definirIdentidadeDaConversao", () => ({
  definirIdentidadeDaConversao: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const estado = {
  conectada: false,
  habilitada: false,
  temToken: false,
  datasetId: null,
  testEventCode: null,
} as never;

function com(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mock.get.mockImplementation(async (url: string) => {
    if (url.includes("/accounts")) {
      return { data: { contas: [{ id: "act_1", nome: "Conta" }], conta_padrao: "act_1" } };
    }
    if (url.includes("/pixels")) return { data: { pixels: [{ id: "777", nome: "Pixel Loja" }] } };
    if (url.includes("/pages")) return { data: { paginas: [{ id: "888", nome: "Página Loja" }] } };
    throw new Error("rota inesperada");
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("seletor de pixel", () => {
  it("sem conexão de leitura: campo manual, aviso e nenhuma chamada", () => {
    com(<FormularioDeConversoes estado={estado} idioma="pt-BR" />);
    expect(screen.getByLabelText("Identificador do destino de conversões")).toBeTruthy();
    expect(screen.getByText(/Ajustes › Meta Ads/)).toBeTruthy();
    expect(mock.get).not.toHaveBeenCalled();
  });

  it("com conexão: lista os pixels, escolhe e cai no campo manual", async () => {
    com(<FormularioDeConversoes estado={estado} idioma="pt-BR" leituraConectada />);
    const gatilho = await screen.findByLabelText("Destino de conversões");
    escolherValor(gatilho, "777");
    await waitFor(() =>
      expect(screen.queryByLabelText("Identificador do destino de conversões")).toBeNull(),
    );
    escolherValor(gatilho, "__manual__");
    const campo = (await screen.findByLabelText(
      "Identificador do destino de conversões",
    )) as HTMLInputElement;
    expect(campo.value).toBe("777");
    fireEvent.change(campo, { target: { value: "999999" } });
    expect(campo.value).toBe("999999");
  });

  it("erro da lista: avisa e mantém o campo manual", async () => {
    mock.get.mockRejectedValue(new Error("falhou"));
    com(<FormularioDeConversoes estado={estado} idioma="pt-BR" leituraConectada />);
    expect(await screen.findByText(/Não consegui carregar a lista da Meta/)).toBeTruthy();
    expect(screen.getByLabelText("Identificador do destino de conversões")).toBeTruthy();
  });
});

describe("seletor de Página", () => {
  it("com conexão: escolhe a Página da lista", async () => {
    com(
      <IdentidadeDaConversao pageId={null} whatsappBusinessAccountId={null} idioma="pt-BR" leituraConectada />,
    );
    const gatilho = await screen.findByLabelText("ID da Página");
    escolherValor(gatilho, "888");
    await waitFor(() =>
      expect(screen.getByLabelText("ID da Página").textContent).toContain("Página Loja"),
    );
  });

  it("lista vazia: cai no campo manual", async () => {
    mock.get.mockResolvedValue({ data: { paginas: [] } });
    com(
      <IdentidadeDaConversao pageId={null} whatsappBusinessAccountId={null} idioma="pt-BR" leituraConectada />,
    );
    expect(await screen.findByText(/não devolveu nenhuma opção/)).toBeTruthy();
    expect(screen.getByLabelText("ID da Página")).toBeTruthy();
  });

  it("sem conexão: campo manual como sempre", () => {
    com(<IdentidadeDaConversao pageId="123" whatsappBusinessAccountId={null} idioma="pt-BR" />);
    expect((screen.getByLabelText("ID da Página") as HTMLInputElement).value).toBe("123");
    expect(mock.get).not.toHaveBeenCalled();
  });
});
