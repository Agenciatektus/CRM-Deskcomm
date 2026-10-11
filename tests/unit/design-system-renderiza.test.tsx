/**
 * A vitrine do design system monta inteira, nos três modos, com TODAS as
 * seções dos quadros DS, e nada que ela pede sai para a rede.
 *
 * Ela junta dezenas de componentes reais (navegação, bolhas, coluna do lead,
 * Central de avisos, paleta) com dados de exemplo. Um campo novo obrigatório
 * num deles derruba a página em runtime, e nenhuma outra suíte a renderiza.
 *
 * O `fetch` real é trocado por um que REPROVA: se a API da vitrine
 * (`ApiDaVitrine`) deixasse escapar uma chamada, ela chegaria aqui.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usuario = vi.hoisted(() => ({
  id: "00000000-0000-4000-8000-0000000d5060",
  email: "dono@exemplo.test",
  is_platform_admin: true,
  support: null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/design-system",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: usuario, activeOrg: { orgId: "org", role: "admin", modulos_ligados: [], capacidades_ligadas: [] } }),
  useAuthOpcional: () => ({ user: usuario, activeOrg: null }),
  useUser: () => usuario,
  useActiveOrg: () => null,
  usePermission: () => true,
}));

import { VitrineDoDesignSystem } from "@/app/app/design-system/_componentes/VitrineDoDesignSystem";

const SECOES = [
  "cor",
  "tipo",
  "espaco",
  "forma",
  "navegacao",
  "componentes",
  "mensagens",
  "lead",
  "menus",
  "retorno",
  "layout",
  "regras",
];

let escapou: ReturnType<typeof vi.fn>;
const fetchDoAmbiente = globalThis.fetch;

beforeEach(() => {
  // O jsdom não desenha canvas; a amostra mostra "—", que é o caminho certo fora do navegador.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  escapou = vi.fn(() => Promise.reject(new Error("chamada escapou da vitrine")));
  globalThis.fetch = escapou as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = fetchDoAmbiente;
  document.documentElement.setAttribute("data-theme", "light");
});

async function montar() {
  const r = render(<VitrineDoDesignSystem />);
  // Os efeitos pedem o resumo do contato, as tarefas e os avisos: deixa responder.
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 50));
  });
  return r;
}

describe("vitrine do design system", () => {
  it("tem as seções dos quadros DS, na ordem, nos dois painéis", async () => {
    const { container } = await montar();
    for (const tema of ["claro", "escuro"]) {
      const painel = container.querySelector(`[data-painel-do-tema="${tema}"]`)!;
      const ids = [...painel.querySelectorAll("h2[id^='ds-']")].map((h) => h.id.replace(/^ds-|-(claro|escuro)$/g, ""));
      expect(ids, tema).toEqual(SECOES);
    }
  });

  it("a coluna do lead, a Central de avisos e as bolhas recebem as amostras", async () => {
    const { container } = await montar();
    const claro = container.querySelector('[data-painel-do-tema="claro"]')!;
    expect(claro.querySelectorAll('[data-testid="message-bubble"]').length).toBeGreaterThan(10);
    expect(claro.textContent).toContain("Rafael Nogueira está sem dono");
    expect(claro.textContent).toContain("Ligar para confirmar o horário de sábado");
    expect(claro.textContent).toContain("Veja no celular");
  });

  it("nada sai para a rede", async () => {
    await montar();
    expect(escapou).not.toHaveBeenCalled();
  });

  it.each(["dark", "light"])("lado a lado com o app %s: cada painel tem o próprio tema e o <html> fica como está", async (app) => {
    document.documentElement.setAttribute("data-theme", app);
    const { container } = await montar();
    expect(container.querySelector('[data-painel-do-tema="claro"]')?.getAttribute("data-theme")).toBe("light");
    expect(container.querySelector('[data-painel-do-tema="escuro"]')?.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe(app);
  });

  it("no modo Escuro o <html> fica escuro e, ao sair, volta ao que era", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { container, unmount } = await montar();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Escuro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(container.querySelector('[data-painel-do-tema="escuro"]')?.hasAttribute("data-theme")).toBe(false);
    unmount();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("o selo mora na amostra: token novo diz 'Novo nesta etapa' e o diferente mostra o protótipo", async () => {
    const { container } = await montar();
    const claro = container.querySelector('[data-painel-do-tema="claro"]')!;
    const hover = claro.querySelector('[data-amostra="--color-hover"]')!;
    expect(hover.textContent).toContain("Novo nesta etapa");
    const info = claro.querySelector('[data-amostra="--color-info-fg"]')!;
    expect(info.textContent).toContain("Diferente do protótipo");
    expect(info.textContent).toContain("#0077bc");
    expect(claro.querySelector('[data-amostra="--color-bg"] [data-status]')).toBeNull();
  });
});
