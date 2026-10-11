/**
 * A vitrine do design system monta inteira, nos três modos, sem quebrar.
 *
 * Ela junta ~30 componentes reais com dado de mentira (conversa, nota, canal).
 * Um campo novo obrigatório num deles derruba a página inteira em runtime, e
 * nenhuma outra suíte a renderiza. Este teste é o alarme disso, e prova dois
 * contratos:
 *
 *  - lado a lado: os DOIS painéis levam `data-theme` e o <html> não é tocado.
 *    A primeira versão deixava o painel claro sem atributo e forçava o <html>;
 *    no carregamento, o `ThemeProvider` devolvia o escuro e o painel "claro"
 *    saía escuro (achado na tela, com o app escuro);
 *  - o selo do mapa fica DENTRO da amostra a que se refere, e token criado
 *    nesta etapa diz "Novo nesta etapa", não "Falta".
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VitrineDoDesignSystem } from "@/app/app/design-system/_componentes/VitrineDoDesignSystem";

afterEach(() => {
  cleanup();
  document.documentElement.setAttribute("data-theme", "light");
});

describe("vitrine do design system", () => {
  it.each(["dark", "light"])("lado a lado com o app %s: cada painel tem o próprio tema e o <html> fica como está", (app) => {
    document.documentElement.setAttribute("data-theme", app);
    const { container } = render(<VitrineDoDesignSystem />);
    expect(container.querySelector('[data-painel-do-tema="claro"]')?.getAttribute("data-theme")).toBe("light");
    expect(container.querySelector('[data-painel-do-tema="escuro"]')?.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe(app);
    expect(screen.getAllByText("Cores")).toHaveLength(2);
  });

  it("no modo Escuro o <html> fica escuro e o painel não leva atributo próprio", () => {
    const { container } = render(<VitrineDoDesignSystem />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Escuro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    const painel = container.querySelector('[data-painel-do-tema="escuro"]');
    expect(painel).not.toBeNull();
    expect(painel?.hasAttribute("data-theme")).toBe(false);
  });

  it("ao sair do modo de um tema, devolve o tema que o <html> tinha", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { unmount } = render(<VitrineDoDesignSystem />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Claro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    unmount();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("o selo mora na amostra: token novo diz 'Novo nesta etapa' e o diferente mostra o protótipo", () => {
    const { container } = render(<VitrineDoDesignSystem />);
    const claro = container.querySelector('[data-painel-do-tema="claro"]')!;
    const hover = claro.querySelector('[data-amostra="--color-hover"]')!;
    expect(hover.textContent).toContain("Novo nesta etapa");
    expect(hover.textContent).not.toContain("Falta");
    const info = claro.querySelector('[data-amostra="--color-info-fg"]')!;
    expect(info.textContent).toContain("Diferente do protótipo");
    expect(info.textContent).toContain("#0077bc");
    // Igual não ganha selo.
    expect(claro.querySelector('[data-amostra="--color-bg"] [data-status]')).toBeNull();
    // E nenhum selo de cor ficou solto fora de uma amostra.
    const grupoCores = claro.querySelector('[aria-labelledby="ds-cores-claro"]')!;
    const soltos = [...grupoCores.querySelectorAll("[data-status]")].filter((s) => !s.closest("[data-amostra]"));
    expect(soltos).toHaveLength(0);
  });
});
