/**
 * SELETOR DE ETAPA (dossiê do Pipeline + painel do Inbox).
 *
 * O que este arquivo prova é que o seletor NÃO tem régua própria: cada destino
 * cai na mutação que o quadro já usa para o mesmo gesto — `/move` com CAS para
 * etapa aberta, `/win` para ganho, a janela de perder (com motivo) para perda.
 * O `Select` do Radix é trocado por um `<select>` nativo: o que está em teste é
 * a decisão, não o popover.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mover = vi.fn();
const ganhar = vi.fn();
let podeMover = true;

vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => podeMover }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/hooks/kanban/useMoveCard", () => ({
  useMoveCard: () => ({ mutate: mover, isPending: false }),
}));
vi.mock("@/hooks/kanban/useUpdateLead", () => ({
  useWinLead: () => ({ mutate: ganhar, isPending: false }),
}));
vi.mock("@/components/kanban/LoseLeadDialog", () => ({
  LoseLeadDialog: (p: { motivosDoFunil?: string[] }) => (
    <div data-testid="janela-de-perder">{(p.motivosDoFunil ?? []).join(",")}</div>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select data-testid="seletor-de-etapa" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, disabled, children }: { value: string; disabled?: boolean; children: React.ReactNode }) => (
    <option value={value} disabled={disabled}>{children}</option>
  ),
}));

import { SeletorDeEtapa } from "@/components/kanban/SeletorDeEtapa";

const ETAPAS = [
  { id: "novo", name: "Novo", is_won: false, is_lost: false },
  { id: "proposta", name: "Proposta", is_won: false, is_lost: false },
  { id: "ganho", name: "Ganho", is_won: true, is_lost: false },
  { id: "perdido", name: "Perdido", is_won: false, is_lost: true },
];

function montar(extra: Partial<React.ComponentProps<typeof SeletorDeEtapa>> = {}) {
  return render(
    <SeletorDeEtapa
      leadId="lead-1"
      pipelineId="p-1"
      stageId="novo"
      updatedAt="2026-09-25T12:00:00.000Z"
      aberto
      etapas={ETAPAS}
      {...extra}
    />,
  );
}

beforeEach(() => {
  mover.mockReset();
  ganhar.mockReset();
  podeMover = true;
});

describe("seletor de etapa", () => {
  it("etapa aberta vai pelo /move, com o updated_at do lead como CAS", () => {
    montar();
    fireEvent.change(screen.getByTestId("seletor-de-etapa"), { target: { value: "proposta" } });
    expect(mover).toHaveBeenCalledTimes(1);
    expect(mover.mock.calls[0]![0]).toMatchObject({
      leadId: "lead-1",
      stageId: "proposta",
      expectedUpdatedAt: "2026-09-25T12:00:00.000Z",
    });
    expect(ganhar).not.toHaveBeenCalled();
  });

  it("etapa de ganho vai pelo /win, não pelo /move", () => {
    montar();
    fireEvent.change(screen.getByTestId("seletor-de-etapa"), { target: { value: "ganho" } });
    expect(ganhar).toHaveBeenCalledWith({ leadId: "lead-1" }, expect.anything());
    expect(mover).not.toHaveBeenCalled();
  });

  it("etapa de perda abre a janela do motivo, com os motivos do funil — e não grava nada sozinha", () => {
    montar({ motivosDoFunil: ["Sem orçamento"] });
    fireEvent.change(screen.getByTestId("seletor-de-etapa"), { target: { value: "perdido" } });
    expect(screen.getByTestId("janela-de-perder").textContent).toBe("Sem orçamento");
    expect(mover).not.toHaveBeenCalled();
    expect(ganhar).not.toHaveBeenCalled();
  });

  it("escolher a etapa atual não faz nada", () => {
    montar();
    fireEvent.change(screen.getByTestId("seletor-de-etapa"), { target: { value: "novo" } });
    expect(mover).not.toHaveBeenCalled();
  });

  it("sem permissão de mover (viewer), só mostra o nome da etapa", () => {
    podeMover = false;
    montar();
    expect(screen.queryByTestId("seletor-de-etapa")).toBeNull();
    expect(screen.getByTestId("etapa-somente-leitura").textContent).toBe("Novo");
  });

  it("negócio fechado não troca de etapa por aqui", () => {
    montar({ aberto: false, stageId: "ganho" });
    expect(screen.queryByTestId("seletor-de-etapa")).toBeNull();
    expect(screen.getByTestId("etapa-somente-leitura").textContent).toBe("Ganho");
  });

  it("lead em etapa ARQUIVADA: o seletor mostra onde ele está, desabilitado, e não fica em branco", () => {
    montar({ stageId: "etapa-velha" });
    const atual = screen.getByRole("option", { name: "Etapa arquivada" }) as HTMLOptionElement;
    expect(atual.disabled).toBe(true);
    expect((screen.getByTestId("seletor-de-etapa") as HTMLSelectElement).value).toBe("etapa-velha");
  });
});
