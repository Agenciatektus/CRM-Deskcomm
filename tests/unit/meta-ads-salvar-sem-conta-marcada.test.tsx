import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const salvarMock = vi.fn(async () => ({ ok: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/settings/updateAdInsightsConnection", () => ({
  updateAdInsightsConnection: (...a: unknown[]) => (salvarMock as (...x: unknown[]) => unknown)(...a),
  disconnectAdInsights: vi.fn(),
}));
vi.mock("@/hooks/ads/useMetaAds", () => ({
  useTodasAsContasDaMeta: () => ({
    data: { data: { contas: [{ id: "act_1", nome: "Alfa", moeda: "BRL", status: 1 }] } },
    isLoading: false,
    error: null,
  }),
}));

import { FormularioDeMetaAds } from "@/app/app/settings/meta-ads/_form";

function montar(via: "oauth" | "manual") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FormularioDeMetaAds
        conectada
        contaPadrao={null}
        contasPermitidas={null}
        podeAmpliar
        via={via}
        expiraEm={null}
        diasParaVencer={null}
        oauthDisponivel
        oauthFalta={[]}
        idioma="pt-BR"
      />
    </QueryClientProvider>,
  );
}

describe("salvar com nenhuma conta marcada", () => {
  it("login Meta: Salvar desabilitado, com a frase, e nada é enviado", async () => {
    salvarMock.mockClear();
    montar("oauth");
    const botao = (await screen.findByRole("button", { name: "Salvar" })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByText("Nenhuma conta liberada. Marque ao menos uma para salvar.")).toBeTruthy();
    fireEvent.submit(botao.closest("form")!);
    expect(salvarMock).not.toHaveBeenCalled();
  });

  it("token colado: segue enviando null", async () => {
    salvarMock.mockClear();
    montar("manual");
    const botao = (await screen.findByRole("button", { name: "Salvar" })) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
    fireEvent.submit(botao.closest("form")!);
    await waitFor(() => expect(salvarMock).toHaveBeenCalled());
    expect(salvarMock.mock.calls[0]![0]).toMatchObject({ allowed_ad_account_ids: null });
  });
});

describe("Colar outro token", () => {
  it("leva o foco ao campo do token", async () => {
    montar("oauth");
    fireEvent.click(await screen.findByRole("button", { name: "Colar outro token" }));
    await waitFor(() => expect(document.activeElement?.id).toBe("access_token"));
  });
});
