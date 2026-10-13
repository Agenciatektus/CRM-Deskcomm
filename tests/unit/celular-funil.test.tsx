/**
 * M3.1: o Funil no celular. Seletor de funil, resumo, abas de etapa com contagem e os
 * cartões da etapa em LISTA, com "Mover" na folha (regras do quadro).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [{ user_id: "u-1", full_name: "Paula" }] }),
}));
vi.mock("@/hooks/kanban/useMoveCard", () => ({ useMoveCard: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/components/kanban/LoseLeadDialog", () => ({ LoseLeadDialog: () => null }));
vi.mock("@/components/mobile/FunisDoMenu", () => ({
  useFunisDoMenu: () => [
    { id: "p-1", name: "Vendas" },
    { id: "p-2", name: "Pós-venda" },
  ],
}));
const lead = (id: string, stage: string, valor: number | null, status = "open") => ({
  id,
  title: `Lead ${id}`,
  stage_id: stage,
  status,
  value_cents: valor,
  currency: "BRL",
  position_in_stage: 1,
  owner_user_id: "u-1",
  updated_at: "t",
});
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: () => ({
    isLoading: false,
    data: {
      pipeline: { id: "p-1", name: "Vendas" },
      stages: [
        { id: "e1", name: "Novo", is_won: false, is_lost: false, is_archived: false },
        { id: "e2", name: "Proposta", is_won: false, is_lost: false, is_archived: false },
        { id: "g", name: "Fechado", is_won: true, is_lost: false, is_archived: false },
      ],
      leads: [lead("1", "e1", 100000), lead("2", "e1", 50000), lead("3", "e2", null), lead("4", "g", 99900, "won")],
    },
  }),
}));

import { FunilNoCelular, resumoDoFunil } from "@/components/mobile/telas/Funil";

describe("funil no celular", () => {
  it("resumo: só os abertos, e a soma do valor deles", () => {
    expect(resumoDoFunil([lead("1", "e1", 100000), lead("2", "e1", null), lead("3", "g", 5000, "won")] as never)).toEqual({
      abertos: 2,
      centavos: 100000,
      moeda: "BRL",
    });
  });

  it("abas de etapa com contagem; os cartões da etapa em lista; trocar de aba troca a lista", () => {
    render(<FunilNoCelular pipelineId="p-1" aoTrocarFunil={vi.fn()} />);
    expect(screen.getByText(/3 leads abertos/)).toBeInTheDocument();
    const abas = within(screen.getByRole("tablist", { name: "Etapas do funil" })).getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Novo2", "Proposta1", "Fechado1"]);
    expect(screen.getByRole("link", { name: /Lead 1/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lead 3/ })).toBeNull();
    fireEvent.click(abas[1]!);
    expect(screen.getByRole("link", { name: /Lead 3/ })).toBeInTheDocument();
  });

  it("Mover abre a folha com as etapas; o seletor troca de funil", () => {
    const aoTrocarFunil = vi.fn();
    render(<FunilNoCelular pipelineId="p-1" aoTrocarFunil={aoTrocarFunil} />);
    fireEvent.click(screen.getByRole("button", { name: "Mover Lead 1" }));
    const folha = screen.getByRole("dialog", { name: "Mover etapa" });
    expect(within(folha).getByRole("button", { name: "Proposta" })).toBeInTheDocument();
    fireEvent.click(within(folha).getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("button", { name: /Vendas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pós-venda" }));
    expect(aoTrocarFunil).toHaveBeenCalledWith("p-2");
  });
});
