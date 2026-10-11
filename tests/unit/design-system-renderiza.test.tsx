/**
 * A vitrine do design system monta inteira, nos três modos, sem quebrar.
 *
 * Ela junta ~30 componentes reais com dado de mentira (conversa, nota, canal).
 * Um campo novo obrigatório num deles derruba a página inteira em runtime, e
 * nenhuma outra suíte a renderiza. Este teste é o alarme disso, e também prova
 * o contrato com o <html>: o modo escolhido vira `data-theme` e, ao sair, o
 * atributo volta ao que era.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VitrineDoDesignSystem } from "@/app/app/design-system/_componentes/VitrineDoDesignSystem";

afterEach(() => {
  cleanup();
  document.documentElement.setAttribute("data-theme", "light");
});

describe("vitrine do design system", () => {
  it("abre no lado a lado com os dois painéis e o painel escuro como subárvore", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { container } = render(<VitrineDoDesignSystem />);
    expect(container.querySelector('[data-painel-do-tema="claro"]')).not.toBeNull();
    const escuro = container.querySelector('[data-painel-do-tema="escuro"]');
    expect(escuro?.getAttribute("data-theme")).toBe("dark");
    // O <html> fica claro no lado a lado (ver o porquê no componente).
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
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

  it("ao sair, devolve o tema que o <html> tinha", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { unmount } = render(<VitrineDoDesignSystem />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    unmount();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
