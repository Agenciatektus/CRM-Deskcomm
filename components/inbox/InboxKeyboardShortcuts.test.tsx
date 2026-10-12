import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { InboxKeyboardShortcuts } from "./InboxKeyboardShortcuts";

/**
 * O atalho "e" chamava `window.confirm()` direto — mesmo defeito do botão
 * "Fechar" de `ConversationHeader`: bloqueado em iframe, ignora o tema, não
 * passa por `t()`. Agora usa o mesmo `AlertDialog` do resto do produto.
 */

function renderAtalhos(
  overrides: Partial<React.ComponentProps<typeof InboxKeyboardShortcuts>> = {},
) {
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof InboxKeyboardShortcuts> = {
    visibleIds: ["c1"],
    selectedId: "c1",
    onSelect: vi.fn(),
    onFocusReply: vi.fn(),
    onClaim: vi.fn(),
    onClose,
    onToggleHelp: vi.fn(),
    ...overrides,
  };
  render(<InboxKeyboardShortcuts {...props} />);
  return { onClose };
}

describe("atalho de teclado 'e' — fechar conversa", () => {
  // Quadro DS: fechar age na hora, com "Desfazer" no aviso (quem desfaz é o
  // `useEncerrarComDesfazer`, chamado pelo `onClose` do InboxLayout).
  it("apertar 'e' fecha a conversa selecionada, sem janela de confirmação", async () => {
    const user = userEvent.setup();
    const { onClose } = renderAtalhos();

    await user.keyboard("e");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("com os atalhos desligados, 'e' não fecha nada", async () => {
    const user = userEvent.setup();
    const { onClose } = renderAtalhos({ enabled: false });

    await user.keyboard("e");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("'j' e depois 'e' fecham a conversa que ficou selecionada", async () => {
    const fechou = vi.fn();
    function Inbox() {
      const [sel, setSel] = useState<string | null>("c1");
      const onClose = useCallback(() => {
        if (sel) fechou(sel);
      }, [sel]);
      return (
        <InboxKeyboardShortcuts
          visibleIds={["c1", "c2"]}
          selectedId={sel}
          onSelect={setSel}
          onFocusReply={vi.fn()}
          onClaim={vi.fn()}
          onClose={onClose}
          onToggleHelp={vi.fn()}
        />
      );
    }
    const user = userEvent.setup();
    render(<Inbox />);

    await user.keyboard("j");
    await user.keyboard("e");

    await waitFor(() => expect(fechou).toHaveBeenCalledTimes(1));
    expect(fechou).toHaveBeenCalledWith("c2");
  });
});
