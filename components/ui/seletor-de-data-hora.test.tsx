/** Sem valor, o calendário abre no mês de hoje, mesmo com `min` de 1900 (campo que aceita passado). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SeletorDeDataHora } from "./seletor-de-data-hora";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

describe("SeletorDeDataHora", () => {
  it("não abre em 1900 quando min é antigo e não há valor", () => {
    render(<SeletorDeDataHora valor={null} modo="data" passado min={new Date(1900, 0, 1)} onEscolher={() => {}} />);
    expect(document.body.textContent).toContain(String(new Date().getFullYear()));
    expect(document.body.textContent).not.toContain("1900");
  });

  it("max no passado sem valor abre no mês do max", () => {
    const max = new Date(new Date().getFullYear() - 2, 2, 15);
    render(<SeletorDeDataHora valor={null} modo="data" passado max={max} onEscolher={() => {}} />);
    expect(document.body.textContent).toContain(String(max.getFullYear()));
  });

  it("min um ano à frente abre nele", () => {
    const min = new Date(new Date().getFullYear() + 1, 5, 10);
    render(<SeletorDeDataHora valor={null} modo="data" min={min} onEscolher={() => {}} />);
    expect(document.body.textContent).toContain(String(min.getFullYear()));
  });
});
