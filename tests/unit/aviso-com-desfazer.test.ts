/**
 * O "Aviso com Desfazer" (quadro DS): 5 s, Desfazer chama a rota inversa, e a
 * exclusão adiada só chama a rota depois do tempo (ou ao fechar o aviso), nunca
 * se Desfazer foi apertado antes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { adiarAcao, adiarExclusao, avisarComDesfazer, DURACAO_DO_DESFAZER } from "@/lib/ui/aviso-com-desfazer";

type Opcoes = { duration: number; action: { label: string; onClick: () => void }; onAutoClose?: () => void; onDismiss?: () => void };
const opcoes = () => toast.mock.calls.at(-1)![1] as Opcoes;

beforeEach(() => {
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
