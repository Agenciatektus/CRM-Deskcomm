import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EscolhaDeFluxo } from "./EscolhaDeFluxo";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const abrir = (extra: { instagramIndisponivel?: string } = {}) => {
  const onWhatsapp = vi.fn();
  const onFechar = vi.fn();
  render(<EscolhaDeFluxo onWhatsapp={onWhatsapp} onFechar={onFechar} {...extra} />);
  return { onWhatsapp, onFechar };
};

beforeEach(() => push.mockReset());

describe("EscolhaDeFluxo", () => {
  it("abre com os dois grupos e as quatro linhas", () => {
    abrir();
    expect(screen.getByRole("dialog", { name: /O que você quer conectar/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mensagens" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Voz" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("data-linha"))).toHaveLength(4);
  });

  it("WhatsApp fecha e abre o assistente", () => {
    const { onWhatsapp, onFechar } = abrir();
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    expect(onFechar).toHaveBeenCalled();
    expect(onWhatsapp).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    [/Instagram/, "instagram"],
    [/Ligação/, "voz"],
    [/Cadastrar número de telefone/, "telefonia"],
  ])("%s navega para a aba %s", (nome, aba) => {
    const { onFechar } = abrir();
    fireEvent.click(screen.getByRole("button", { name: nome }));
    expect(onFechar).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(`/app/connections?aba=${aba}`);
  });

  it("o foco abre na linha do WhatsApp e as setas percorrem as linhas", () => {
    abrir();
    const [wa, ig] = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-linha")) as [HTMLElement, HTMLElement];
    expect(wa).toHaveFocus();
    fireEvent.keyDown(wa, { key: "ArrowDown" });
    expect(ig).toHaveFocus();
    fireEvent.keyDown(ig, { key: "ArrowUp" });
    expect(wa).toHaveFocus();
  });

  it("Instagram indisponível: aria-disabled, motivo escrito, focável e sem navegar", () => {
    abrir({ instagramIndisponivel: "O suporte libera a conexão direta" });
    const ig = screen.getByRole("button", { name: /Instagram/ });
    expect(ig).toHaveAttribute("aria-disabled", "true");
    expect(ig).not.toBeDisabled();
    expect(screen.getByText("O suporte libera a conexão direta")).toBeInTheDocument();
    ig.focus();
    expect(ig).toHaveFocus();
    fireEvent.click(ig);
    expect(push).not.toHaveBeenCalled();
  });
});
