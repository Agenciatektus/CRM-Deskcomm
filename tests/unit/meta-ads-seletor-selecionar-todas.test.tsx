import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const contas = Array.from({ length: 4 }, (_, i) => ({
  id: `act_${i + 1}`,
  nome: i < 2 ? `Alfa ${i}` : `Beta ${i}`,
  moeda: "BRL",
  status: 1,
}));

vi.mock("@/hooks/ads/useMetaAds", () => ({
  useTodasAsContasDaMeta: () => ({ data: { data: { contas } }, isLoading: false, error: null }),
}));

import { SeletorDeContas } from "@/app/app/settings/meta-ads/_seletor-de-contas";

function montar(selecionadas: string[]) {
  const onSelecionadas = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SeletorDeContas
        selecionadas={selecionadas}
        padrao=""
        onSelecionadas={onSelecionadas}
        onPadrao={() => {}}
        onCarregada={() => {}}
        podeAmpliar
        idioma="pt-BR"
      />
    </QueryClientProvider>,
  );
  return onSelecionadas;
}
const todas = () => screen.getByLabelText(/Selecionar/) as HTMLInputElement;

describe("Selecionar todas", () => {
  it("nenhuma marcada: desmarcada; clicar marca todas", () => {
    const on = montar([]);
    expect(todas().checked).toBe(false);
    expect(todas().indeterminate).toBe(false);
    fireEvent.click(todas());
    expect(on).toHaveBeenCalledWith(["act_1", "act_2", "act_3", "act_4"]);
  });

  it("parte marcada: indeterminada, com a contagem X de N", () => {
    montar(["act_1"]);
    expect(todas().indeterminate).toBe(true);
    expect(screen.getByTestId("meta-contagem-marcadas").textContent).toBe("1 de 4 marcadas");
  });

  it("todas marcadas: marcada; clicar desmarca", () => {
    const on = montar(["act_1", "act_2", "act_3", "act_4"]);
    expect(todas().checked).toBe(true);
    fireEvent.click(todas());
    expect(on).toHaveBeenCalledWith([]);
  });

  it("com busca vira 'as N visíveis' e age só nelas", () => {
    const on = montar(["act_3"]);
    fireEvent.change(screen.getByPlaceholderText("Buscar por nome ou id"), { target: { value: "alfa" } });
    expect(screen.getByText("Selecionar as 2 visíveis")).toBeTruthy();
    fireEvent.click(todas());
    expect(on).toHaveBeenCalledWith(["act_3", "act_1", "act_2"]);
    expect(screen.getByTestId("meta-contagem-marcadas").textContent).toBe("1 de 4 marcadas");
  });
});
