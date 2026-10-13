/**
 * P1 do Cassio na #180: escolher a etapa de GANHO pelo menu da conversa (e pela folha
 * do celular) chamava `/win` na hora, e `/win` dispara `lead.won` (conversão de
 * anúncio, cadência, push). Agora é a mesma ação adiada do painel e do quadro:
 * - nada vai ao servidor antes do aviso acabar (5 s);
 * - "Desfazer" cancela sem chamar o servidor;
 * - a trava por negócio impede o segundo ganho enquanto o primeiro está segurado.
 * E mover de etapa ganha o "Desfazer" pela mesma rota `/move` (P2-3).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => {
  const chamadas: { mensagem: unknown; opcoes: Record<string, unknown> | undefined }[] = [];
  const toast = Object.assign(
    vi.fn((mensagem: unknown, opcoes?: Record<string, unknown>) => {
      chamadas.push({ mensagem, opcoes });
    }),
    {
      success: vi.fn((mensagem: unknown, opcoes?: Record<string, unknown>) => {
        chamadas.push({ mensagem, opcoes });
      }),
      error: vi.fn(),
      warning: vi.fn(),
    },
  );
  return { toast, chamadas };
});
vi.mock("sonner", () => ({ toast: sonner.toast }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/lib/inbox/releitura-do-contato", () => ({ avisarQueOCrmDoContatoMudou: vi.fn() }));

const servidor = vi.hoisted(() => ({ ganhar: vi.fn(async () => ({})), mover: vi.fn(async () => ({ data: { updated_at: "t2" } })) }));
vi.mock("@/hooks/kanban/useUpdateLead", () => ({ useWinLead: () => ({ mutateAsync: servidor.ganhar, isPending: false }) }));
vi.mock("@/hooks/kanban/useMoveCard", () => ({ useMoveCard: () => ({ mutateAsync: servidor.mover, isPending: false }) }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: async () => ({
      data: {
        leads: [
          {
            id: "lead-1",
            status: "open",
            pipeline_id: "p-1",
            stage_id: "e1",
            position_in_stage: 3000,
            updated_at: "t1",
            etapas: [
              { id: "e1", name: "Novo", is_won: false, is_lost: false },
              { id: "e2", name: "Proposta", is_won: false, is_lost: false },
              { id: "ganho", name: "Fechado", is_won: true, is_lost: false },
            ],
          },
        ],
      },
    }),
  },
}));

import { useFunilDoContato } from "@/hooks/inbox/useFunilDoContato";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useFunilDoContato("k-1", true, vi.fn()), { wrapper: envolver });
}

/** O último aviso com ação (o do ganho adiado ou o do "Etapa alterada"). */
const ultimoAviso = () => sonner.chamadas[sonner.chamadas.length - 1]!;

beforeEach(() => {
  sonner.chamadas.length = 0;
  servidor.ganhar.mockClear();
  servidor.mover.mockClear();
});

describe("ganho pelo menu e pela folha: adiado, com Desfazer e trava", () => {
  it("nada vai ao servidor antes do aviso acabar; ao acabar, ganha uma vez", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lead).not.toBeNull());
    act(() => result.current.escolher("ganho"));
    expect(servidor.ganhar).not.toHaveBeenCalled();
    const { opcoes } = ultimoAviso();
    expect(opcoes?.duration).toBe(5_000);
    await act(async () => (opcoes!.onAutoClose as () => void)());
    expect(servidor.ganhar).toHaveBeenCalledTimes(1);
    expect(servidor.ganhar).toHaveBeenCalledWith({ leadId: "lead-1" });
  });

  it("Desfazer cancela sem chamar o servidor", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lead).not.toBeNull());
    act(() => result.current.escolher("ganho"));
    const { opcoes } = ultimoAviso();
    act(() => (opcoes!.action as { onClick: () => void }).onClick());
    await act(async () => (opcoes!.onAutoClose as () => void)());
    expect(servidor.ganhar).not.toHaveBeenCalled();
  });

  it("a trava por negócio impede o segundo ganho enquanto o primeiro está segurado", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lead).not.toBeNull());
    act(() => result.current.escolher("ganho"));
    const avisos = sonner.chamadas.length;
    await waitFor(() => expect(result.current.ganhoPendente).toBe(true));
    act(() => result.current.escolher("ganho"));
    expect(sonner.chamadas.length).toBe(avisos);
    // Solta a trava para o próximo caso.
    const { opcoes } = sonner.chamadas[avisos - 1]!;
    act(() => (opcoes!.action as { onClick: () => void }).onClick());
  });
});

describe("mover de etapa: Desfazer pela mesma rota", () => {
  it("o aviso de etapa alterada volta para a etapa e a posição de antes, com o updated_at novo", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lead).not.toBeNull());
    await act(async () => result.current.escolher("e2"));
    await waitFor(() => expect(servidor.mover).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(ultimoAviso().mensagem).toBe("Etapa alterada"));
    const desfazer = ultimoAviso().opcoes!.action as { onClick: () => void };
    await act(async () => desfazer.onClick());
    expect(servidor.mover).toHaveBeenLastCalledWith({
      leadId: "lead-1",
      stageId: "e1",
      positionInStage: 3000,
      expectedUpdatedAt: "t2",
    });
  });
});
