/**
 * P1 do Cassio na #172: editar uma tarefa sem mexer no prazo não reenvia o
 * prazo. Remontado de dia + hora, ele perderia os segundos da tarefa de
 * automação, e a rota leria isso como prazo novo (no passado, 422).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FormularioDeTarefa } from "@/app/app/tasks/_components/FormularioDeTarefa";
import type { NovaTarefa, Tarefa } from "@/lib/tarefas/tipos";
import { preencherData } from "@/tests/unit/helpers/controles-do-ds";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const TAREFA = {
  id: "t-1",
  organization_id: "o-1",
  title: "Ligar",
  description: null,
  due_date: "2026-10-11T12:34:27.512Z",
  priority: "medium",
  status: "pending",
  lead_id: null,
  contact_id: null,
  assigned_to: null,
  created_by: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
} as unknown as Tarefa;

// Tipado pelo parâmetro: sem ele, `mock.calls` vira a tupla vazia `[]` e o
// `calls[0]![0]` não compila no `pnpm typecheck` (que inclui tests/).
function montar(aoSalvar = vi.fn(async (_entrada: NovaTarefa): Promise<unknown> => undefined)) {
  render(<FormularioDeTarefa aberto aoMudarAbertura={() => undefined} tarefa={TAREFA} aoSalvar={aoSalvar} />);
  return aoSalvar;
}

describe("formulário de tarefa: o prazo só vai quando muda", () => {
  it("mudar só o título NÃO manda due_date", async () => {
    const aoSalvar = montar();
    const titulo = screen.getByLabelText("O que precisa ser feito");
    await userEvent.clear(titulo);
    await userEvent.type(titulo, "Ligar de novo");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1));
    const enviado = aoSalvar.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(enviado.title).toBe("Ligar de novo");
    expect("due_date" in enviado).toBe(false);
  });

  it("CONTROLE: mudar o horário manda o prazo novo", async () => {
    const aoSalvar = montar();
    preencherData(screen.getByLabelText("Horário"), "15:00");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1));
    const enviado = aoSalvar.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(typeof enviado.due_date).toBe("string");
  });
});
