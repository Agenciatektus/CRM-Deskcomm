/**
 * A conversa selecionada na lista do Inbox é legível no tema escuro.
 *
 * Os degraus `accent-50…950` têm o MESMO hex nos dois temas (`app/globals.css`):
 * são a rampa da marca, não tokens de superfície. A linha selecionada usava
 * `bg-accent-50` — quase branco — e o nome do contato é `text-text`, que no
 * escuro é claro: branco sobre branco. `accent-soft` é o token que o tema troca
 * (uma camada translúcida no escuro), e é o que as outras seleções da tela já usam.
 *
 * A medida do contraste de verdade (cor computada contra o fundo efetivo) está
 * na spec `tests/e2e/inbox-selecionada-no-escuro.spec.ts`; aqui fica a regra
 * que a impede de voltar sem precisar de navegador.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import { conversaDeExemplo } from "@/components/inbox/__fixtures__/conversa";

describe("a conversa selecionada é legível no tema escuro", () => {
  it("o fundo da selecionada é o token que muda com o tema, não um degrau fixo da rampa", () => {
    render(<ConversationListItem {...conversaDeExemplo.props} conversation={conversaDeExemplo.conversation} isSelected />);
    const linha = screen.getByRole("button", { current: true });
    expect(linha.className).toContain("bg-accent-soft");
    expect(linha.className).not.toMatch(/\bbg-accent-(50|100|200|300|400|500|600|700|800|900|950)\b/);
  });

  it("a não selecionada não ganha o fundo", () => {
    render(<ConversationListItem {...conversaDeExemplo.props} conversation={conversaDeExemplo.conversation} isSelected={false} />);
    const linha = screen.getByRole("button");
    expect(linha.getAttribute("aria-current")).toBeNull();
    expect(linha.className).not.toContain("bg-accent-soft");
  });
});
