/**
 * A casca do app de celular (M1.3): qual aba acende em cada rota, quando a barra some,
 * onde o FAB aparece e o que os contadores dizem. As consultas dos contadores são as
 * MESMAS do menu (mockadas aqui), sem consulta nova.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { abaDaRota, acaoDeCriar, ehRaizDeAba, ehTelaCheia } from "@/lib/mobile/abas";

const nav = vi.hoisted(() => ({ rota: "/app/inbox", busca: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.rota,
  useSearchParams: () => nav.busca,
  useRouter: () => ({ push: nav.push, back: vi.fn() }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => ({ activeOrg: { orgId: "o-1" } }) }));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({ useConversationCounts: () => ({ data: { fila: 3 } }) }));
vi.mock("@/hooks/tasks/useTarefasAtrasadas", () => ({ useTarefasAtrasadas: () => ({ data: 2 }) }));
vi.mock("@/hooks/ai/useAgentInbox", () => ({ useAgentInbox: () => ({ data: { open_count: 0 } }) }));

import { BarraInferior } from "@/components/mobile/BarraInferior";

beforeEach(() => {
  nav.rota = "/app/inbox";
  nav.busca = new URLSearchParams();
  nav.push.mockClear();
});

describe("rotas do app de celular", () => {
  it("cada rota acende a sua aba; o resto é do Mais", () => {
    expect(abaDaRota("/app/inbox")).toBe("conversas");
    expect(abaDaRota("/app/pipelines/p-1")).toBe("funil");
    expect(abaDaRota("/app/leads/l-1")).toBe("funil");
    expect(abaDaRota("/app/agenda")).toBe("tarefas");
    expect(abaDaRota("/app/ai/inbox")).toBe("avisos");
    expect(abaDaRota("/app/ai/agents")).toBe("mais");
    expect(abaDaRota("/app/settings/profile")).toBe("mais");
  });

  it("começo de aba x tela empilhada", () => {
    expect(ehRaizDeAba("/app/tasks")).toBe(true);
    expect(ehRaizDeAba("/app/pipelines/p-1")).toBe(false);
  });

  it("tela cheia: conversa aberta e ficha do lead", () => {
    expect(ehTelaCheia("/app/inbox", "c-1")).toBe(true);
    expect(ehTelaCheia("/app/inbox/c-1", null)).toBe(true);
    expect(ehTelaCheia("/app/leads/l-1", null)).toBe(true);
    expect(ehTelaCheia("/app/inbox", null)).toBe(false);
  });

  it("FAB só onde há o que criar, pela ação principal da tela", () => {
    expect(acaoDeCriar("/app/inbox")?.href).toBe("/app/contacts?criar=1");
    expect(acaoDeCriar("/app/tasks")?.href).toBe("/app/tasks?criar=1");
    expect(acaoDeCriar("/app/pipelines/p-1")?.href).toBe("/app/pipelines/p-1?criar=1");
    expect(acaoDeCriar("/app/kanban")).toBeNull();
    expect(acaoDeCriar("/app/ai/inbox")).toBeNull();
  });
});

describe("barra inferior", () => {
  const montar = () => render(<BarraInferior maisAberto={false} aoAbrirMais={vi.fn()} />);

  it("5 abas na ordem, só no celular, com a aba da rota acesa", () => {
    montar();
    const barra = screen.getByRole("navigation", { name: "Seções do CRM" });
    expect(barra.className).toMatch(/\bhidden\b/);
    expect(barra.className).toContain("mb:grid");
    const nomes = [...barra.querySelectorAll("a, button")].map((el) => el.textContent);
    expect(nomes).toEqual(["3Conversas", "Funil", "2Tarefas", "Avisos", "Mais"]);
    expect(screen.getByRole("link", { name: "Conversas, 3 esperando uma pessoa" })).toHaveAttribute("aria-current", "page");
  });

  it("contador zero não aparece, e o nome acessível diz o número", () => {
    montar();
    expect(screen.getByRole("link", { name: "Tarefas, 2 atrasadas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avisos" })).toBeInTheDocument();
  });

  it("some na tela cheia (conversa aberta)", () => {
    nav.busca = new URLSearchParams("id=c-1");
    montar();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("tocar de novo na aba acesa volta ao começo dela", () => {
    nav.rota = "/app/pipelines/p-1";
    montar();
    fireEvent.click(screen.getByRole("link", { name: "Funil" }));
    expect(nav.push).toHaveBeenCalledWith("/app/kanban");
  });

  it("Mais abre o menu", () => {
    const aoAbrirMais = vi.fn();
    render(<BarraInferior maisAberto={false} aoAbrirMais={aoAbrirMais} />);
    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    expect(aoAbrirMais).toHaveBeenCalledTimes(1);
  });
});
