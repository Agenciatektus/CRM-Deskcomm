/**
 * O "Aviso com Desfazer" (quadro DS): 5 s, Desfazer chama a rota inversa, e a
 * exclusão adiada só chama a rota depois do tempo (ou ao fechar o aviso), nunca
 * se Desfazer foi apertado antes.
 */
import { act, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { acoesPendentes, adiarAcao, adiarExclusao, avisarComDesfazer, DURACAO_DO_DESFAZER } from "@/lib/ui/aviso-com-desfazer";

type Opcoes = { duration: number; action: { label: string; onClick: () => void }; onAutoClose?: () => void; onDismiss?: () => void };
const opcoes = () => toast.mock.calls.at(-1)![1] as Opcoes;

beforeEach(() => {
  // Ação que um teste deixou segurada termina aqui, para não vazar no próximo.
  for (const chamada of toast.mock.calls) (chamada[1] as Opcoes | undefined)?.onDismiss?.();
  toast.mockClear();
  toast.error.mockClear();
});

describe("aviso com Desfazer", () => {
  it("dura 5 s e o Desfazer chama a volta", async () => {
    const desfazer = vi.fn(() => Promise.resolve());
    avisarComDesfazer("Conversa fechada.", "Desfazer", desfazer);
    expect(DURACAO_DO_DESFAZER).toBe(5000);
    expect(opcoes().duration).toBe(5000);
    expect(opcoes().action.label).toBe("Desfazer");
    opcoes().action.onClick();
    await vi.waitFor(() => expect(desfazer).toHaveBeenCalledTimes(1));
  });

  it("Desfazer que falha mostra o erro, não engole", async () => {
    avisarComDesfazer("x", "Desfazer", () => Promise.reject(new Error("409")));
    opcoes().action.onClick();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("409"));
  });
});

describe("exclusão adiada", () => {
  it("só exclui quando o tempo acaba, e uma vez só", async () => {
    const excluir = vi.fn(() => Promise.resolve());
    adiarExclusao("O lead será excluído.", "Desfazer", excluir);
    expect(excluir).not.toHaveBeenCalled();
    opcoes().onAutoClose?.();
    opcoes().onDismiss?.();
    await vi.waitFor(() => expect(excluir).toHaveBeenCalledTimes(1));
  });

  it("Desfazer antes do tempo cancela: a rota nunca é chamada", async () => {
    const excluir = vi.fn(() => Promise.resolve());
    const desfeito = vi.fn();
    adiarExclusao("O lead será excluído.", "Desfazer", excluir, desfeito);
    opcoes().action.onClick();
    opcoes().onDismiss?.();
    opcoes().onAutoClose?.();
    expect(excluir).not.toHaveBeenCalled();
    expect(desfeito).toHaveBeenCalledTimes(1);
  });
});

describe("ação adiada genérica (ganho, perda, troca de funil)", () => {
  it("adiarExclusao é a mesma adiarAcao", () => {
    expect(adiarExclusao).toBe(adiarAcao);
  });

  it("sem o fim do aviso (página fechada) a ação nunca acontece", () => {
    const ganhar = vi.fn(() => Promise.resolve());
    adiarAcao("Negócio ganho.", "Desfazer", ganhar);
    // Nem `onAutoClose` nem `onDismiss`: a aba fechou com o aviso na tela.
    expect(ganhar).not.toHaveBeenCalled();
  });

  it("erro da ação adiada vira aviso de erro", async () => {
    adiarAcao("Negócio ganho.", "Desfazer", () => Promise.reject(new Error("500")));
    opcoes().onAutoClose?.();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("500"));
  });
});

describe("ação pendente: tempo restante no aviso e pergunta antes de sair (follow-up do Cassio na #169)", () => {
  const sair = () => {
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  };

  it("o aviso conta o tempo que falta: Ganho em 5 s, 4 s, 3 s…", () => {
    vi.useFakeTimers();
    try {
      adiarAcao((s) => `Ganho em ${s} s`, "Desfazer", () => Promise.resolve());
      const conteudo = toast.mock.calls.at(-1)![0] as ReactElement;
      render(conteudo);
      expect(screen.getAllByText("Ganho em 5 s").length).toBeGreaterThan(0);
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.getByText("Ganho em 3 s")).toBeInTheDocument();
      opcoes().onAutoClose?.();
    } finally {
      vi.useRealTimers();
    }
  });

  it("texto fixo ganha o tempo entre parênteses", () => {
    adiarAcao("O lead será excluído.", "Desfazer", () => Promise.resolve());
    render(toast.mock.calls.at(-1)![0] as ReactElement);
    expect(screen.getAllByText("O lead será excluído. (5 s)").length).toBeGreaterThan(0);
    opcoes().onAutoClose?.();
  });

  it("com ação segurada o navegador pergunta antes de sair; ao executar, para de perguntar", () => {
    expect(sair()).toBe(false);
    adiarAcao((s) => `Ganho em ${s} s`, "Desfazer", () => Promise.resolve());
    expect(acoesPendentes()).toBe(1);
    expect(sair()).toBe(true);
    opcoes().onAutoClose?.();
    expect(acoesPendentes()).toBe(0);
    expect(sair()).toBe(false);
  });

  it("Desfazer também solta a saída; duas ações só soltam quando as duas acabam", () => {
    adiarAcao("a", "Desfazer", () => Promise.resolve());
    const primeira = opcoes();
    adiarAcao("b", "Desfazer", () => Promise.resolve());
    const segunda = opcoes();
    expect(acoesPendentes()).toBe(2);
    primeira.action.onClick();
    primeira.onDismiss?.();
    expect(sair()).toBe(true);
    segunda.onDismiss?.();
    expect(acoesPendentes()).toBe(0);
    expect(sair()).toBe(false);
  });
});
