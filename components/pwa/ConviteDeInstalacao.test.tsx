import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE_DISPENSADO, ConviteDeInstalacao } from "./ConviteDeInstalacao";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

function modoInstalado(sim: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: sim }) as unknown as typeof window.matchMedia;
}

function dispararConvite() {
  const evento = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  evento.prompt = vi.fn(async () => undefined);
  evento.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(evento);
  });
  return evento;
}

beforeEach(() => {
  window.localStorage.clear();
  modoInstalado(false);
});
afterEach(() => vi.restoreAllMocks());

describe("convite de instalação do app", () => {
  it("não aparece sem o convite do navegador", () => {
    render(<ConviteDeInstalacao />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("aparece com o convite e só no celular (classe mb:flex)", () => {
    render(<ConviteDeInstalacao />);
    dispararConvite();
    const cartao = screen.getByRole("complementary", { name: "Convite para instalar o app" });
    expect(cartao.className).toContain("hidden");
    expect(cartao.className).toContain("mb:flex");
  });

  it("Instalar abre o convite do sistema", async () => {
    render(<ConviteDeInstalacao />);
    const evento = dispararConvite();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Instalar" }));
    });
    expect(evento.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("Agora não grava a dispensa, e o convite não volta", () => {
    const { unmount } = render(<ConviteDeInstalacao />);
    dispararConvite();
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(window.localStorage.getItem(CHAVE_DISPENSADO)).toBe("1");
    unmount();
    render(<ConviteDeInstalacao />);
    dispararConvite();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("já instalado, nunca aparece", () => {
    modoInstalado(true);
    render(<ConviteDeInstalacao />);
    dispararConvite();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
