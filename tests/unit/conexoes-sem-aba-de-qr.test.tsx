/**
 * A tela de Conexões é uma página só. Números por QR e Redes sociais saíram da navegação:
 * `?aba=numeros|sociais` voltam para a página, e as telas de apoio abrem com o caminho de volta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ aba: null as string | null, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.aba ? `aba=${nav.aba}` : ""),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
const { marcador } = await vi.hoisted(async () => {
  const React = await import("react");
  return { marcador: (id: string) => () => React.createElement("div", { "data-testid": id }) };
});
vi.mock("@/components/connections/ConexoesPagina", () => ({ ConexoesPagina: marcador("pagina") }));
vi.mock("@/components/connections/CanalGraphParceiroClient", () => ({ CanalGraphParceiroClient: marcador("graph") }));
vi.mock("@/components/connections/CanalOficialClient", () => ({ CanalOficialClient: marcador("oficial") }));
vi.mock("@/components/connections/CanalInstagramClient", () => ({ CanalInstagramClient: marcador("instagram") }));
vi.mock("@/components/connections/CanalParceiroClient", () => ({ CanalParceiroClient: marcador("parceiro") }));
vi.mock("@/components/connections/CanalVozClient", () => ({ CanalVozClient: marcador("voz") }));
vi.mock("@/components/connections/TemplatesClient", () => ({ TemplatesClient: marcador("templates-meta") }));
vi.mock("@/components/connections/TemplatesParceiroClient", () => ({ TemplatesParceiroClient: marcador("templates-parceiro") }));
vi.mock("@/components/connections/TelefoniaClient", () => ({ TelefoniaClient: marcador("telefonia") }));
vi.mock("@/components/connections/CanalHospedadoClient", () => ({ CanalHospedadoClient: marcador("hospedado") }));

import { ConexoesShell } from "@/components/connections/ConexoesShell";

const montar = (aba: string | null, graph: { label: string } | null = null) => {
  nav.aba = aba;
  render(<ConexoesShell wahaConfigured={false} wahaDesligado wacallsConfigured={false} graphParceiro={graph} />);
};

afterEach(() => {
  cleanup();
  nav.aba = null;
  nav.replace.mockClear();
});

describe("ConexoesShell: página única", () => {
  it("sem aba: a página, sem barra de abas", () => {
    montar(null);
    expect(screen.getByTestId("pagina")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Números por QR" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Redes sociais" })).toBeNull();
  });

  it.each(["numeros", "sociais"])("?aba=%s abre a página e limpa a URL", (aba) => {
    montar(aba);
    expect(screen.getByTestId("pagina")).toBeTruthy();
    expect(nav.replace).toHaveBeenCalledWith("/app/connections", { scroll: false });
  });

  it("controle negativo: aba de apoio não redireciona e mostra o caminho de volta", () => {
    montar("oficial");
    expect(screen.getByTestId("oficial")).toBeTruthy();
    expect(screen.queryByTestId("pagina")).toBeNull();
    expect(screen.getByRole("link", { name: /Conexões/ }).getAttribute("href")).toBe("/app/connections");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("?aba=modelos abre os modelos da Meta e do parceiro", () => {
    montar("modelos");
    expect(screen.getByRole("tab", { name: "Templates da Meta" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Modelos do parceiro" })).toBeTruthy();
    expect(screen.getByTestId("templates-meta")).toBeTruthy();
  });

  it("?aba=graph sem o parceiro ligado cai na página", () => {
    montar("graph", null);
    expect(screen.getByTestId("pagina")).toBeTruthy();
  });
});
