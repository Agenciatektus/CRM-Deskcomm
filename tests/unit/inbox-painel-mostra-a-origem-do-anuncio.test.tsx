/**
 * A COLUNA DE DETALHES DO INBOX MOSTRA DE QUAL ANÚNCIO O CONTATO VEIO.
 *
 * Quem atende olha o painel lateral do Inbox, não o dossiê do funil. A seção
 * "Origem" usa a mesma leitura e a mesma grade do dossiê (`OrigemDoContato`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrigemNoPainel } from "@/components/inbox/painel/OrigemNoPainel";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/contacts/useHierarquiaDoAnuncio", () => ({
  useHierarquiaDoAnuncio: () => ({ data: undefined }),
}));

let contato: { source: string; source_metadata: Record<string, unknown> } | undefined;
vi.mock("@/hooks/contacts/useContact", () => ({
  useContact: () => ({ data: contato ? { data: contato } : undefined }),
}));

function montar(id: string | null = "c-1") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrigemNoPainel contactId={id} />
    </QueryClientProvider>,
  );
}

describe("OrigemNoPainel (Inbox)", () => {
  it("mostra campanha, conjunto, anúncio e ids do contato que veio de anúncio", () => {
    contato = {
      source: "meta_ads",
      source_metadata: {
        ad_platform: "meta_ads",
        ad_id: "1202100",
        ad_source_id: "AfClid",
        ad_title: "Anúncio no Status",
        campaign_name: "03 - [TEKTUS] CTWA",
        adset_name: "AVALIACAO | COLUNA",
        ad_name: "OMBRO | VID",
        ad_captured_at: "2026-10-20T12:06:49.000Z",
        ad_source_url: "https://wa.me/message/X",
      },
    };
    montar();
    expect(screen.getByTestId("painel-origem")).toBeTruthy();
    expect(screen.getByText("03 - [TEKTUS] CTWA")).toBeTruthy();
    expect(screen.getByText("AVALIACAO | COLUNA")).toBeTruthy();
    expect(screen.getByText("OMBRO | VID")).toBeTruthy();
    expect(screen.getByText("1202100")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir" }).getAttribute("href")).toBe("https://wa.me/message/X");
  });

  it("não renderiza nada quando o contato não carregou", () => {
    contato = undefined;
    const { container } = montar();
    expect(container.querySelector('[data-testid="painel-origem"]')).toBeNull();
  });

  it("não renderiza link com esquema que não seja http(s)", () => {
    contato = { source: "meta_ads", source_metadata: { ad_platform: "meta_ads", ad_source_url: "javascript:alert(1)" } };
    montar();
    expect(screen.queryByRole("link", { name: "Abrir" })).toBeNull();
  });
});
