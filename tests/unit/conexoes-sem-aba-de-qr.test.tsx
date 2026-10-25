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
  ConnectionsClient: () => <div data-testid="lista-por-qr" />,
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
  it("desligado: sem a aba por QR, abre na Verdash", () => {
    render(<ConexoesShell wahaConfigured={false} wahaDesligado wacallsConfigured={false} />);
    expect(screen.queryByRole("tab", { name: "Números por QR" })).toBeNull();
    expect(screen.queryByTestId("lista-por-qr")).toBeNull();
    expect(screen.getByRole("tab", { name: "Verdash" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("aba-verdash")).toBeTruthy();
  });

  it("desligado: ?aba=numeros na URL também não abre a lista por QR", () => {
    nav.aba = "numeros";
    render(<ConexoesShell wahaConfigured={false} wahaDesligado wacallsConfigured={false} />);
    expect(screen.queryByTestId("lista-por-qr")).toBeNull();
  });

  it("controle negativo, ligado: a aba por QR existe e é a padrão", () => {
    render(<ConexoesShell wahaConfigured wacallsConfigured={false} />);
    expect(screen.getByRole("tab", { name: "Números por QR" }).getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("lista-por-qr")).toBeTruthy();
  });
});
