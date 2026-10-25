/**
 * Com `WAHA_HABILITADO=false` a tela de Conexões não oferece a aba dos números
 * por QR e abre na Verdash (o caminho FZAP). Ligado, nada muda. As abas filhas
 * viram marcadores: o que está sob teste é qual aba existe, não o conteúdo delas.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ aba: null as string | null, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.aba ? `aba=${nav.aba}` : ""),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/components/connections/ConnectionsClient", () => ({
  ConnectionsClient: (p: { wahaDesligado?: boolean }) => (
    <div data-testid="lista-por-qr" data-desligado={String(Boolean(p.wahaDesligado))} />
  ),
}));
vi.mock("@/components/connections/RedesSociaisClient", () => ({ RedesSociaisClient: () => <div /> }));
vi.mock("@/components/connections/CanalGraphParceiroClient", () => ({ CanalGraphParceiroClient: () => <div /> }));
vi.mock("@/components/connections/CanalOficialClient", () => ({ CanalOficialClient: () => <div /> }));
vi.mock("@/components/connections/CanalInstagramClient", () => ({ CanalInstagramClient: () => <div /> }));
vi.mock("@/components/connections/CanalParceiroClient", () => ({ CanalParceiroClient: () => <div /> }));
vi.mock("@/components/connections/CanalVozClient", () => ({ CanalVozClient: () => <div /> }));
vi.mock("@/components/connections/TemplatesClient", () => ({ TemplatesClient: () => <div /> }));
vi.mock("@/components/connections/TemplatesParceiroClient", () => ({ TemplatesParceiroClient: () => <div /> }));
vi.mock("@/components/connections/TelefoniaClient", () => ({ TelefoniaClient: () => <div /> }));
vi.mock("@/components/connections/CanalHospedadoClient", () => ({
  CanalHospedadoClient: () => <div data-testid="aba-verdash" />,
}));

import { ConexoesShell } from "@/components/connections/ConexoesShell";

afterEach(() => {
  cleanup();
  nav.aba = null;
});

describe("ConexoesShell e o interruptor do WAHA", () => {
  it("desligado: abre na Verdash e a lista de números existentes continua na aba", () => {
    render(<ConexoesShell wahaConfigured={false} wahaDesligado wacallsConfigured={false} />);
    expect(screen.getByRole("tab", { name: "Verdash" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("aba-verdash")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Números por QR" })).toBeTruthy();
  });

  it("desligado: ?aba=numeros abre a lista (sem criar), nunca um painel em branco", () => {
    nav.aba = "numeros";
    render(<ConexoesShell wahaConfigured={false} wahaDesligado wacallsConfigured={false} />);
    const lista = screen.getByTestId("lista-por-qr");
    expect(lista.getAttribute("data-desligado")).toBe("true");
  });

  it("controle negativo, ligado: a aba por QR existe e é a padrão", () => {
    render(<ConexoesShell wahaConfigured wacallsConfigured={false} />);
    expect(screen.getByRole("tab", { name: "Números por QR" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("lista-por-qr")).toBeTruthy();
  });
});
