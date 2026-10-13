import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BotaoDeDisponibilidade } from "./BotaoDeDisponibilidade";

/**
 * O botão de disponibilidade do topo é a MESMA chave de plantão da Equipe:
 * lê SÓ o próprio estado (`/availability/me`, nunca o roster com a equipe) e
 * grava pelo PATCH de sempre. O que se prende aqui: quem não atende não vê o
 * botão nem dispara a consulta, o rótulo diz o estado real, e o clique pede o
 * estado OPOSTO para a própria pessoa (nunca para outra).
 */

const auth = {
  user: { id: "u-1", support: null as null | { access_mode: string } },
  activeOrg: { role: "agent" as string },
};
let minha: { isSuccess: boolean; data?: { data: { user_id: string; is_available: boolean } | null } };
const consultou = vi.fn();
const mutate = vi.fn();
const mensagem = vi.fn();
const roster = vi.fn();

vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/team/useAttendants", () => ({
  useMinhaDisponibilidade: (enabled: boolean) => {
    consultou(enabled);
    return minha;
  },
  useAttendants: () => roster(),
  useUpdateAvailability: (texto?: string) => {
    mensagem(texto);
    return { mutate, isPending: false };
  },
}));

beforeEach(() => {
  auth.user.support = null;
  auth.activeOrg.role = "agent";
  minha = { isSuccess: true, data: { data: { user_id: "u-1", is_available: true } } };
  for (const f of [consultou, mutate, mensagem, roster]) f.mockReset();
});
afterEach(cleanup);

describe("botão de disponibilidade no topo", () => {
  it("mostra o estado da PRÓPRIA linha e o clique pede o oposto para a própria pessoa", async () => {
    render(<BotaoDeDisponibilidade />);
    const botao = screen.getByRole("button", { name: "Disponível" });
    await userEvent.click(botao);
    expect(mutate).toHaveBeenCalledWith({ userId: "u-1", patch: { is_available: false } });
    // Nunca o roster (nome e e-mail da equipe pelo admin client), e o aviso fala
    // da disponibilidade, não de "atendente".
    expect(roster).not.toHaveBeenCalled();
    expect(mensagem).toHaveBeenCalledWith("Disponibilidade atualizada.");
  });

  it("indisponível diz Indisponível e religa", async () => {
    minha = { isSuccess: true, data: { data: { user_id: "u-1", is_available: false } } };
    render(<BotaoDeDisponibilidade />);
    await userEvent.click(screen.getByRole("button", { name: "Ausente" }));
    expect(mutate).toHaveBeenCalledWith({ userId: "u-1", patch: { is_available: true } });
  });

  it("some para quem está abaixo de atendente", () => {
    auth.activeOrg.role = "viewer";
    render(<BotaoDeDisponibilidade />);
    expect(screen.queryByTestId("botao-de-disponibilidade")).toBeNull();
    // Nem pergunta: a rota recusaria viewer.
    expect(consultou).toHaveBeenCalledWith(false);
  });

  it("some no acompanhamento de suporte somente leitura", () => {
    auth.user.support = { access_mode: "support_readonly" };
    render(<BotaoDeDisponibilidade />);
    expect(screen.queryByTestId("botao-de-disponibilidade")).toBeNull();
  });

  it("antes da resposta não aparece, em vez de inventar um estado", () => {
    minha = { isSuccess: false };
    render(<BotaoDeDisponibilidade />);
    expect(screen.queryByTestId("botao-de-disponibilidade")).toBeNull();
  });

  it("sem linha (nunca configurou) mostra Indisponível, que é o estado real", () => {
    minha = { isSuccess: true, data: { data: null } };
    render(<BotaoDeDisponibilidade />);
    expect(screen.getByRole("button", { name: "Ausente" })).toBeTruthy();
  });
});
