/**
 * O DOSSIÊ DO NEGÓCIO MOSTRA DE QUAL ANÚNCIO O CLIENTE VEIO.
 *
 * Antes só a ficha do contato mostrava origem; quem trabalha pelo funil abria o
 * dossiê sem campanha nem anúncio. Renderiza a seção com o metadata do clique
 * para o WhatsApp (sem nomes resolvidos) e com o do site (UTMs).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrigemDoNegocio } from "@/components/kanban/OrigemDoNegocio";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/contacts/useHierarquiaDoAnuncio", () => ({
  useHierarquiaDoAnuncio: () => ({ data: undefined }),
}));

let contato: { source: string; source_metadata: Record<string, unknown> } | undefined;
vi.mock("@/hooks/contacts/useContact", () => ({
  useContact: () => ({ data: contato ? { data: contato } : undefined }),
}));

function montar() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrigemDoNegocio contactId="c-1" />
    </QueryClientProvider>,
  );
}

describe("OrigemDoNegocio", () => {
  it("mostra anúncio, ids e link do clique para o WhatsApp", () => {
    contato = {
      source: "meta_ads",
      source_metadata: {
        ad_platform: "meta_ads",
        ad_id: "1202100",
        ad_source_id: "AfClid",
        ad_title: "Clareamento a laser",
        ad_source_url: "https://fb.me/abc",
      },
    };
    montar();
    expect(screen.getByText("Clareamento a laser")).toBeTruthy();
    expect(screen.getByText("1202100")).toBeTruthy();
    expect(screen.getByText("AfClid")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir" }).getAttribute("href")).toBe("https://fb.me/abc");
    expect(screen.getByText(/não informa o posicionamento/)).toBeTruthy();
  });

  it("mostra campanha, conjunto e anúncio vindos da URL do site", () => {
    contato = {
      source: "site",
      source_metadata: {
        ad_platform: "site",
        utm_source: "google",
        utm_campaign: "implante",
        utm_adset: "grupo-1",
        utm_ad: "texto-a",
      },
    };
    montar();
    expect(screen.getByText("google")).toBeTruthy();
    expect(screen.getByText("implante")).toBeTruthy();
    expect(screen.getByText("grupo-1")).toBeTruthy();
    expect(screen.getByText("texto-a")).toBeTruthy();
  });

  it("não renderiza link com esquema que não seja http(s)", () => {
    contato = { source: "meta_ads", source_metadata: { ad_platform: "meta_ads", ad_source_url: "javascript:alert(1)" } };
    montar();
    expect(screen.queryByRole("link", { name: "Abrir" })).toBeNull();
  });
});
