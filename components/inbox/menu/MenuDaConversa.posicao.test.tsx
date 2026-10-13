/** O menu de contexto da conversa não sai pela borda da janela (fase 3.6). */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { montar, rede } from "@/components/inbox/__fixtures__/bancada-do-menu";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
const sessao = vi.hoisted(() => ({ pode: true, support: null as null | { access_mode: string } }));

vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: sessao.support } }),
  usePermission: () => sessao.pode,
}));

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  push.mockReset();
  sessao.pode = true;
  sessao.support = null;
  rede(api);
});

/**
 * O POSICIONAMENTO É O DO RADIX, MEDIDO: aqui o jsdom ganha medidas falsas (uma
 * janela de 1024x600 e um menu de 272x400) e a pergunta é se o menu aberto
 * perto da borda inferior troca de lado. O controle é o mesmo menu aberto no
 * alto da tela, que fica embaixo do ponto.
 */
describe("posição perto da borda", () => {
  function comMedidas<T>(fn: () => Promise<T>): Promise<T> {
    const proto = HTMLElement.prototype;
    const original = { w: Object.getOwnPropertyDescriptor(proto, "offsetWidth"), h: Object.getOwnPropertyDescriptor(proto, "offsetHeight") };
    const rect = Element.prototype.getBoundingClientRect;
    const html = document.documentElement;
    const ehMenu = (el: Element) => el.hasAttribute("data-radix-popper-content-wrapper");
    Object.defineProperty(proto, "offsetWidth", { configurable: true, get() { return ehMenu(this) ? 272 : 0; } });
    Object.defineProperty(proto, "offsetHeight", { configurable: true, get() { return ehMenu(this) ? 400 : 0; } });
    Object.defineProperty(html, "clientWidth", { configurable: true, value: 1024 });
    Object.defineProperty(html, "clientHeight", { configurable: true, value: 600 });
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute("data-testid") === "ancora-do-menu-da-conversa") {
        const x = parseFloat((this as HTMLElement).style.left);
        const y = parseFloat((this as HTMLElement).style.top);
        return { x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON() {} } as DOMRect;
      }
      return rect.call(this);
    };
    return fn().finally(() => {
      if (original.w) Object.defineProperty(proto, "offsetWidth", original.w);
      if (original.h) Object.defineProperty(proto, "offsetHeight", original.h);
      delete (html as unknown as Record<string, unknown>).clientWidth;
      delete (html as unknown as Record<string, unknown>).clientHeight;
      Element.prototype.getBoundingClientRect = rect;
    });
  }

  it("aberto no rodapé, sobe; aberto no alto, desce (controle)", () =>
    comMedidas(async () => {
      const { linha } = montar();
      fireEvent.contextMenu(linha, { clientX: 100, clientY: 560 });
      await waitFor(() => expect(screen.getByRole("menu")).toHaveAttribute("data-side", "top"));
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      fireEvent.contextMenu(linha, { clientX: 100, clientY: 80 });
      await waitFor(() => expect(screen.getByRole("menu")).toHaveAttribute("data-side", "bottom"));
    }));

  it("aberto na borda direita, não passa dela", () =>
    comMedidas(async () => {
      const { linha } = montar();
      fireEvent.contextMenu(linha, { clientX: 1010, clientY: 80 });
      const embrulho = () => screen.getByRole("menu").closest<HTMLElement>("[data-radix-popper-content-wrapper]")!;
      await waitFor(() => {
        const x = Number(/translate\((-?[\d.]+)px/.exec(embrulho().style.transform)?.[1]);
        expect(x + 272).toBeLessThanOrEqual(1024 - 8);
      });
    }));
});
