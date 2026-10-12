/**
 * Modo compacto da lista (quadro DS, `.app.compact`, decisão do Peterson no
 * fechamento da etapa 2): chave no "Mais" da lista, `data-densidade="compacta"`
 * no contêiner (linha com 8px) e preferência por atendente no navegador.
 */
import { readFileSync } from "node:fs";

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AbasDaInbox } from "@/components/inbox/filtros/AbasDaInbox";
import { CHAVE_DA_LISTA_COMPACTA, listaCompactaPara, useListaCompacta } from "@/hooks/ui/useListaCompacta";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

function Lista({ usuarioId }: { usuarioId: string }) {
  const [ligada, mudar] = useListaCompacta(usuarioId);
  return (
    <div>
      <button type="button" onClick={() => mudar(!ligada)}>
        alternar
      </button>
      <div data-testid="lista" data-densidade={ligada ? "compacta" : undefined} />
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("preferência do modo compacto, por atendente", () => {
  it("vale para quem gravou; de outro atendente, a lista volta ao normal (CONTROLE)", () => {
    expect(listaCompactaPara("u-1:1", "u-1")).toBe(true);
    expect(listaCompactaPara("u-1:0", "u-1")).toBe(false);
    expect(listaCompactaPara("u-1:1", "u-2")).toBe(false);
    expect(listaCompactaPara(null, "u-1")).toBe(false);
    expect(listaCompactaPara("u-1:1", null)).toBe(false);
  });

  it("ligar põe data-densidade=compacta e grava UMA entrada com o id", async () => {
    render(<Lista usuarioId="u-1" />);
    expect(screen.getByTestId("lista")).not.toHaveAttribute("data-densidade");
    await userEvent.click(screen.getByRole("button", { name: "alternar" }));
    expect(screen.getByTestId("lista")).toHaveAttribute("data-densidade", "compacta");
    expect(window.localStorage.getItem(CHAVE_DA_LISTA_COMPACTA)).toBe("u-1:1");
    await userEvent.click(screen.getByRole("button", { name: "alternar" }));
    expect(screen.getByTestId("lista")).not.toHaveAttribute("data-densidade");
  });

  it("outra pessoa no mesmo navegador não herda a escolha", () => {
    window.localStorage.setItem(CHAVE_DA_LISTA_COMPACTA, "u-1:1");
    render(<Lista usuarioId="u-2" />);
    expect(screen.getByTestId("lista")).not.toHaveAttribute("data-densidade");
  });

  it("a mudança vale na hora para todo componente que lê a preferência", async () => {
    render(
      <>
        <Lista usuarioId="u-1" />
        <Lista usuarioId="u-1" />
      </>,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "alternar" })[0]!);
    for (const lista of screen.getAllByTestId("lista")) expect(lista).toHaveAttribute("data-densidade", "compacta");
  });
});

describe("a chave fica no Mais da lista", () => {
  it("Lista compacta é um item marcável que avisa a escolha", async () => {
    const mudar = vi.fn();
    render(
      <AbasDaInbox
        tab="mine"
        principais={[{ value: "mine", label: "Minhas" }]}
        escondidas={[{ value: "closed", label: "Fechadas" }]}
        onChange={() => undefined}
        compacta={{ ligada: false, onChange: mudar }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Mais/ }));
    const item = await screen.findByRole("menuitemcheckbox", { name: "Lista compacta" });
    expect(item).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      await userEvent.click(item);
    });
    expect(mudar).toHaveBeenCalledWith(true);
  });

  it("o CSS do modo compacto existe e a linha da lista lê o token", () => {
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/\[data-densidade="compacta"\]\s*\{\s*--row-py:\s*8px;/);
    expect(readFileSync("components/inbox/ConversationListItem.tsx", "utf8")).toContain("py-(--row-py)");
    expect(readFileSync("components/inbox/InboxLayout.tsx", "utf8")).toContain('data-densidade={listaCompacta ? "compacta" : undefined}');
  });
});
