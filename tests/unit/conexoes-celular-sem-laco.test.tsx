/**
 * No celular, sem `?aba=`, `Canais` mostra os cartões. Nenhum link deles pode voltar para uma
 * aba que saiu (`numeros`, `sociais`), nem para os próprios cartões: todo href abre a página
 * (`vista=pagina`) ou uma tela de apoio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  channelLabel: (c: { display_name: string }) => c.display_name,
  useChannelSessions: () => ({
    data: [{ id: "1", status: "FAILED", display_name: "Caiu", phone_number: null }],
  }),
}));

import { Canais } from "@/components/mobile/telas/Canais";

const APOIO = ["oficial", "parceiro", "graph", "hospedado", "instagram", "voz", "telefonia", "modelos"];

afterEach(() => {
  cleanup();
  nav.query = "";
});

describe("Canais no celular", () => {
  it("nenhum href usa numeros ou sociais, e todo href abre a página ou uma tela de apoio", () => {
    render(<Canais><div data-testid="pagina" /></Canais>);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.length).toBeGreaterThan(3);
    for (const h of hrefs) {
      expect(h).not.toMatch(/numeros|sociais/);
      const q = new URLSearchParams(h.split("?")[1] ?? "");
      expect(q.get("vista") === "pagina" || APOIO.includes(q.get("aba") ?? ""), h).toBe(true);
    }
    expect(screen.queryByText("Redes sociais")).toBeNull();
  });

  it("sem laço: com vista=pagina os cartões saem e a página abre", () => {
    nav.query = "vista=pagina";
    render(<Canais><div data-testid="pagina" /></Canais>);
    expect(screen.getByTestId("pagina")).toBeTruthy();
    expect(screen.queryByText("Conectar outro canal")).toBeNull();
  });
});
