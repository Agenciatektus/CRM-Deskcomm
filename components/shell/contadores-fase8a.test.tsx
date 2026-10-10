/**
 * Visual v2, fase 8a: os dois números novos do menu.
 *
 *   - S14: tarefas atrasadas ao lado de "Tarefas" (`ContadorDeTarefas`);
 *   - S18: leads abertos ao lado de cada funil do nó "Pipeline" (`NoDeFunis`).
 *
 * As contagens vêm do banco (migration 9047, provadas em
 * `tests/invariants/inbox-v2-dados-9047.test.ts`); aqui só a LEITURA na tela,
 * com o CONTROLE de que zero não desenha nada.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContadorDeTarefas } from "./ContadorDeTarefas";
import { NoDeFunis } from "./NoDeFunis";

const estado = vi.hoisted(() => ({ atrasadas: 0 as number | undefined, porFunil: {} as Record<string, number> }));

vi.mock("@/hooks/tasks/useTarefasAtrasadas", () => ({
  useTarefasAtrasadas: () => ({ data: estado.atrasadas }),
}));
vi.mock("@/hooks/pipelines/useLeadsAbertosPorFunil", () => ({
  useLeadsAbertosPorFunil: () => ({ data: estado.porFunil }),
}));

afterEach(() => {
  estado.atrasadas = 0;
  estado.porFunil = {};
});

describe("S14: tarefas atrasadas no menu", () => {
  it("mostra o número, com rótulo para o leitor de tela", () => {
    estado.atrasadas = 3;
    render(<ContadorDeTarefas />);
    expect(screen.getByTestId("contador-de-tarefas")).toHaveTextContent("3");
    expect(screen.getByLabelText("3 tarefas atrasadas")).toBeInTheDocument();
  });

  it("CONTROLE: zero (ou ainda sem resposta) não desenha nada", () => {
    const { container, rerender } = render(<ContadorDeTarefas />);
    expect(container).toBeEmptyDOMElement();
    estado.atrasadas = undefined;
    rerender(<ContadorDeTarefas />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("S18: leads abertos em cada funil", () => {
  const funis = [
    { id: "f-1", name: "Vendas" },
    { id: "f-2", name: "Pós-venda" },
  ];

  it("o funil com leads abertos mostra o número; o sem leads, nada", () => {
    estado.porFunil = { "f-1": 7 };
    // Dentro de um funil o nó já abre (a regra do `NoDeFunis`).
    render(
      <ul>
        <NoDeFunis funis={funis} pathname="/app/pipelines/f-1" classeAtiva="" classeInativa="" />
      </ul>,
    );
    const contadores = screen.getAllByTestId("contador-do-funil");
    expect(contadores).toHaveLength(1);
    expect(contadores[0]).toHaveTextContent("7");
    expect(screen.getByRole("link", { name: /Vendas/ })).toContainElement(contadores[0]!);
  });
});
