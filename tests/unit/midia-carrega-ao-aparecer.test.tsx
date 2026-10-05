import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioPlayer } from "@/components/inbox/media/AudioPlayer";
import { VideoMedia } from "@/components/inbox/media/VideoMedia";

/**
 * ÁUDIO E VÍDEO NÃO PEDEM REDE ANTES DE APARECER (item 11 da auditoria).
 *
 * Antes, `src` + `preload="metadata"` faziam cada mídia do fio buscar o
 * cabeçalho ao montar. "Pedir rede" aqui é ter `src`: sem ele o elemento não
 * tem o que baixar. Mede-se o atributo antes e depois de o observador dizer que
 * o elemento cruzou a tela — e o clique, que carrega e toca na hora.
 */

type Callback = (entradas: Array<{ isIntersecting: boolean }>) => void;
const observadores: Array<{ cb: Callback; alvos: Element[] }> = [];
const original = globalThis.IntersectionObserver;

function aparecer() {
  act(() => {
    for (const o of observadores) o.cb(o.alvos.map(() => ({ isIntersecting: true })));
  });
}

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  observadores.length = 0;
  globalThis.IntersectionObserver = class {
    private o: { cb: Callback; alvos: Element[] };
    constructor(cb: Callback) {
      this.o = { cb, alvos: [] };
      observadores.push(this.o);
    }
    observe(el: Element) {
      this.o.alvos.push(el);
    }
    disconnect() {
      this.o.alvos = [];
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});
afterEach(() => {
  globalThis.IntersectionObserver = original;
});

describe("AudioPlayer: carrega ao aparecer", () => {
  it("fora da tela: sem src e preload=none; ao aparecer: src e metadata", () => {
    const { container } = render(<AudioPlayer messageId="m1" isOutbound={false} />);
    const audio = container.querySelector("audio")!;
    expect(audio.hasAttribute("src")).toBe(false);
    expect(audio.getAttribute("preload")).toBe("none");

    aparecer();
    expect(audio.getAttribute("src")).toBe("/api/v1/messages/m1/media");
    expect(audio.getAttribute("preload")).toBe("metadata");
  });

  it("clicar em tocar antes de aparecer carrega e toca", () => {
    const { container } = render(<AudioPlayer messageId="m1" isOutbound={false} />);
    const audio = container.querySelector("audio")!;
    const play = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    play.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /reproduzir/i }));
    expect(audio.getAttribute("src")).toBe("/api/v1/messages/m1/media");
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /pausar/i })).toBeInTheDocument();
  });
});

describe("VideoMedia: carrega ao aparecer", () => {
  it("fora da tela: sem src e preload=none; ao aparecer: src e metadata", () => {
    const { container } = render(<VideoMedia messageId="m2" />);
    const video = container.querySelector("video")!;
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("preload")).toBe("none");
    // A caixa e o skeleton são os mesmos de antes: nada muda na tela.
    expect(container.querySelector(".aspect-video .absolute.inset-0")).not.toBeNull();

    aparecer();
    expect(video.getAttribute("src")).toBe("/api/v1/messages/m2/media");
    expect(video.getAttribute("preload")).toBe("metadata");
  });
});
