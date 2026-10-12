/**
 * P2-1 do Cassio na #181: a trava por negócio vale para ganho, perda e troca de funil.
 * Uma perda (ou troca) segurada impede o ganho do mesmo negócio, e vice-versa, venha
 * de onde vier; outro negócio não é afetado.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const avisos = vi.hoisted(() => [] as { opcoes: Record<string, unknown> }[]);
vi.mock("sonner", () => ({
  toast: Object.assign((_m: unknown, opcoes: Record<string, unknown>) => avisos.push({ opcoes }), { error: vi.fn() }),
}));

import { adiarFechamento, fechamentoPendente } from "@/lib/ui/fechar-negocio";

const desfazerTodos = () => {
  for (const a of avisos.splice(0)) (a.opcoes.action as { onClick: () => void }).onClick();
};

beforeEach(() => desfazerTodos());

describe("trava por negócio nos três fechamentos", () => {
  it("perda segurada: o ganho do MESMO negócio não se agenda; o de outro, sim", () => {
    const gravar = vi.fn(async () => undefined);
    expect(adiarFechamento("perda", "lead-1", () => "Perdido", "Desfazer", gravar)).toBe(true);
    expect(fechamentoPendente("lead-1")).toBe(true);
    expect(adiarFechamento("ganho", "lead-1", () => "Ganho", "Desfazer", gravar)).toBe(false);
    expect(adiarFechamento("troca", "lead-1", () => "Troca", "Desfazer", gravar)).toBe(false);
    expect(adiarFechamento("ganho", "lead-2", () => "Ganho", "Desfazer", gravar)).toBe(true);
    expect(gravar).not.toHaveBeenCalled();
  });

  it("Desfazer solta a trava", () => {
    adiarFechamento("troca", "lead-3", () => "Troca", "Desfazer", async () => undefined);
    expect(fechamentoPendente("lead-3")).toBe(true);
    desfazerTodos();
    expect(fechamentoPendente("lead-3")).toBe(false);
  });

  it("painel, menu (perda e troca), hook, card, seletor e quadro usam a trava comum", () => {
    for (const arquivo of [
      "components/inbox/painel/AcoesDoNegocio.tsx",
      "components/inbox/menu/DialogosDoMenu.tsx",
      "hooks/inbox/useFunilDoContato.ts",
      "components/kanban/KanbanCardActions.tsx",
      "components/kanban/SeletorDeEtapa.tsx",
      "components/kanban/KanbanBoard.tsx",
    ]) {
      expect(readFileSync(arquivo, "utf8"), arquivo).toContain("adiarFechamento(");
    }
    const menu = readFileSync("components/inbox/menu/DialogosDoMenu.tsx", "utf8");
    expect(menu).toMatch(/adiarFechamento\("perda"/);
    expect(menu).toMatch(/adiarFechamento\("troca"/);
  });
});

describe("pilha do voltar (P2-2 do Cassio na #181)", () => {
  it("o voltar que não troca de rota (ficha, ?id=) não conta", () => {
    const fonte = readFileSync("lib/mobile/pilha.ts", "utf8");
    expect(fonte).toMatch(/if \(window\.location\.pathname !== ultimaRota\.current\) voltou\.current = true;/);
  });
});
