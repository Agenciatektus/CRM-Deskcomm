import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mover = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const permissao = vi.hoisted(() => ({ pode: true }));
vi.mock("@/hooks/kanban/useMoveCard", () => ({ useMoveCard: () => mover }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => permissao.pode }));
const excluir = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@/hooks/kanban/useBulkAction", () => ({ useBulkAction: () => excluir }));

import { BarraDeEtapas } from "./BarraDeEtapas";
import { MenuDoLead } from "./MenuDoLead";
import { SecaoRecolhivel } from "./SecaoRecolhivel";

const ETAPAS = [
  { id: "e1", name: "Novo", is_won: false, is_lost: false },
  { id: "e2", name: "Proposta", is_won: false, is_lost: false },
  { id: "e3", name: "Fechado", is_won: true, is_lost: false },
  { id: "e4", name: "Perdido", is_won: false, is_lost: true },
];

describe("SecaoRecolhivel (P6)", () => {
  it("fechada mostra o resumo de uma linha; aberta mostra o conteúdo", () => {
    render(
      <SecaoRecolhivel testId="s" titulo="Detalhes" resumo="2 de 3 campos">
        <p>conteúdo</p>
      </SecaoRecolhivel>,
    );
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Detalhes/ }));
    expect(screen.queryByText("conteúdo")).toBeNull();
    expect(screen.getByTestId("s-resumo").textContent).toContain("2 de 3 campos");
  });

  it("abre sozinha quando recebe o foco (o atalho do cabeçalho do painel)", () => {
    render(
      <SecaoRecolhivel testId="s" titulo="Obs" abertaInicial={false}>
        <p>texto</p>
      </SecaoRecolhivel>,
    );
    expect(screen.queryByText("texto")).toBeNull();
    act(() => screen.getByTestId("s").focus());
    expect(screen.getByText("texto")).toBeInTheDocument();
  });
});

describe("BarraDeEtapas (P15)", () => {
  it("só as etapas de andamento, a atual marcada, e o clique move pela rota do quadro", () => {
    mover.mutate.mockClear();
    render(
      <BarraDeEtapas leadId="l1" pipelineId="p1" stageId="e1" updatedAt="t" aberto etapas={ETAPAS} leitura={false} onMovido={() => {}} />,
    );
    const passos = screen.getAllByRole("button");
    expect(passos.map((b) => b.textContent)).toEqual(["Novo", "Proposta"]);
    expect(passos[0]).toHaveAttribute("aria-current", "step");
    fireEvent.click(passos[1]!);
    expect(mover.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "l1", stageId: "e2", expectedUpdatedAt: "t" }),
      expect.anything(),
    );
  });

  it("sem permissão ou negócio encerrado, os passos não movem", () => {
    permissao.pode = false;
    render(
      <BarraDeEtapas leadId="l1" pipelineId="p1" stageId="e1" updatedAt="t" aberto etapas={ETAPAS} leitura={false} onMovido={() => {}} />,
    );
    expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    permissao.pode = true;
  });
});

describe("MenuDoLead (P13)", () => {
  it("Editar abre o dossiê no quadro e há o atalho para o quadro do funil", () => {
    render(<MenuDoLead leadId="l1" pipelineId="p1" />);
    const gatilho = screen.getByRole("button", { name: "Mais ações do negócio" });
    fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false });
    expect(screen.getByRole("menuitem", { name: /Editar/ })).toHaveAttribute("href", "/app/pipelines/p1?lead=l1");
    expect(screen.getByRole("menuitem", { name: /Abrir no quadro do funil/ })).toHaveAttribute("href", "/app/pipelines/p1");
  });

  it("P21: Excluir lead pede confirmação e usa a mesma porta do card (bulk delete)", () => {
    permissao.pode = true;
    excluir.mutate.mockClear();
    render(<MenuDoLead leadId="l1" pipelineId="p1" titulo="Clareamento" />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Mais ações do negócio" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir lead/ }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent('Excluir "Clareamento"?');
    expect(excluir.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(excluir.mutate).toHaveBeenCalledWith(
      { action: "delete", lead_ids: ["l1"], params: {} },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("CONTROLE: em leitura (ou sem permissão de mexer no funil) não há Excluir", () => {
    permissao.pode = true;
    const { unmount } = render(<MenuDoLead leadId="l1" pipelineId="p1" leitura />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Mais ações do negócio" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("menuitem", { name: /Excluir/ })).toBeNull();
    unmount();
    permissao.pode = false;
    render(<MenuDoLead leadId="l1" pipelineId="p1" />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Mais ações do negócio" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("menuitem", { name: /Excluir/ })).toBeNull();
    permissao.pode = true;
  });
});
