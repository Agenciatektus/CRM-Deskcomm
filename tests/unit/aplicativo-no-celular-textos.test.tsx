import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** O passo a passo da tela de instalar, renderizado com o aparelho falso. */
vi.mock("@/lib/notifications/service_worker", () => ({ ensureNotifyServiceWorker: vi.fn().mockResolvedValue({}) }));

import { AplicativoNoCelular } from "@/app/app/settings/aplicativo/_client";

const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1";

function aparelho(ua: string, plataforma: string, toques: number) {
  vi.stubGlobal("isSecureContext", true);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(plataforma);
  // O jsdom não define maxTouchPoints.
  Object.defineProperty(navigator, "maxTouchPoints", { value: toques, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)" && toques > 0 }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tela de instalar: o passo a passo fala do navegador certo", () => {
  it("Chrome do iPhone: o passo do Compartilhar não fala em Safari", async () => {
    aparelho(IPHONE_CHROME, "iPhone", 5);
    render(<AplicativoNoCelular />);
    const caixa = await screen.findByTestId("app-iphone-outro-navegador");
    expect(caixa).toHaveTextContent("Compartilhar");
    expect(caixa).toHaveTextContent("Adicionar à Tela de Início");
    expect(caixa).not.toHaveTextContent("Safari");
  });
});
