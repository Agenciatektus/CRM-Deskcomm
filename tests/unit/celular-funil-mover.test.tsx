/**
 * M3.1: "Mover etapa" do cartão do Funil no celular. Ganho adiado 5 s com Desfazer e a
 * trava por negócio; etapa aberta move na hora, com Desfazer pela mesma rota.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const avisos = vi.hoisted(() => [] as { mensagem: unknown; opcoes?: Record<string, unknown> }[]);
vi.mock("sonner", () => ({
  toast: Object.assign((mensagem: unknown, opcoes?: Record<string, unknown>) => avisos.push({ mensagem, opcoes }), {
    success: (mensagem: unknown, opcoes?: Record<string, unknown>) => avisos.push({ mensagem, opcoes }),
    error: vi.fn(),
  }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/kanban/LoseLeadDialog", () => ({ LoseLeadDialog: () => <div role="dialog" aria-label="perder" /> }));
const mover = vi.hoisted(() => vi.fn(async () => ({ data: { updated_at: "t2" } })));
vi.mock("@/hooks/kanban/useMoveCard", () => ({ useMoveCard: () => ({ mutateAsync: mover, isPending: false }) }));

import { FolhaMoverEtapaDoLead } from "@/components/mobile/telas/FolhaMoverEtapaDoLead";

const ETAPAS = [
  { id: "e1", name: "Novo", is_won: false, is_lost: false },
  { id: "e2", name: "Proposta", is_won: false, is_lost: false },
  { id: "g", name: "Fechado", is_won: true, is_lost: false },
  { id: "p", name: "Perdido", is_won: false, is_lost: true },
] as never;
const LEAD = { id: "lead-9", title: "Lead 9", stage_id: "e1", position_in_stage: 7, updated_at: "t1" } as never;

beforeEach(() => {
  for (const a of avisos.splice(0)) (a.opcoes?.action as { onClick?: () => void } | undefined)?.onClick?.();
  mover.mockClear();
});

describe("mover etapa pelo cartão do Funil no celular", () => {
  it("ganho: nada vai ao servidor antes do aviso; Desfazer não chama nada", async () => {
    render(<FolhaMoverEtapaDoLead lead={LEAD} etapas={ETAPAS} pipelineId="p-1" aoFechar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fechado" }));
    expect(mover).not.toHaveBeenCalled();
    const aviso = avisos.at(-1)!;
    expect(aviso.opcoes?.duration).toBe(5000);
    act(() => (aviso.opcoes!.action as { onClick: () => void }).onClick());
    await act(async () => (aviso.opcoes!.onAutoClose as () => void)());
    expect(mover).not.toHaveBeenCalled();
  });

  it("etapa aberta move na hora, e o Desfazer volta à etapa e posição de antes", async () => {
    render(<FolhaMoverEtapaDoLead lead={LEAD} etapas={ETAPAS} pipelineId="p-1" aoFechar={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Proposta" })));
    expect(mover).toHaveBeenCalledWith({ leadId: "lead-9", stageId: "e2", positionInStage: expect.any(Number), expectedUpdatedAt: "t1" });
    const desfazer = avisos.at(-1)!.opcoes!.action as { onClick: () => void };
    await act(async () => desfazer.onClick());
    expect(mover).toHaveBeenLastCalledWith({ leadId: "lead-9", stageId: "e1", positionInStage: 7, expectedUpdatedAt: "t2" });
  });

  it("perda abre a janela do motivo", () => {
    render(<FolhaMoverEtapaDoLead lead={LEAD} etapas={ETAPAS} pipelineId="p-1" aoFechar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Perdido" }));
    // `hidden`: no teste a folha segue aberta (o `aoFechar` é um mock) e o Radix esconde o resto.
    expect(screen.getByRole("dialog", { name: "perder", hidden: true })).toBeInTheDocument();
  });
});
