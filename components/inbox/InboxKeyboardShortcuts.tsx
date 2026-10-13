"use client";
import { useHotkeys } from "react-hotkeys-hook";

interface Props {
  /** Currently visible conversation ids in the list (for j/k nav). */
  visibleIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocusReply: () => void;
  onClaim: () => void;
  onClose: () => void;
  onToggleHelp: () => void;
  /** 9042: "u" marca a conversa selecionada como não lida (para quem aperta). */
  onMarkUnread?: () => void;
  /** 9042: "p" fixa ou desafixa a conversa selecionada (para quem aperta). */
  onTogglePin?: () => void;
  enabled?: boolean;
}

export function InboxKeyboardShortcuts({
  visibleIds,
  selectedId,
  onSelect,
  onFocusReply,
  onClaim,
  onClose,
  onToggleHelp,
  onMarkUnread,
  onTogglePin,
  enabled = true,
}: Props) {
  // "e" fecha na hora, com "Desfazer" no aviso (quadro DS): sem janela de
  // confirmação, os atalhos não precisam parar enquanto ela está aberta.
  const ativo = enabled;
  function step(delta: number) {
    if (visibleIds.length === 0) return;
    const idx = selectedId ? visibleIds.indexOf(selectedId) : -1;
    let next = idx + delta;
    if (idx < 0) next = delta > 0 ? 0 : visibleIds.length - 1;
    if (next < 0) next = 0;
    if (next >= visibleIds.length) next = visibleIds.length - 1;
    const id = visibleIds[next];
    if (id) onSelect(id);
  }

  useHotkeys("j", () => step(1), { enabled: ativo, preventDefault: true }, [
    visibleIds,
    selectedId,
  ]);
  useHotkeys("k", () => step(-1), { enabled: ativo, preventDefault: true }, [
    visibleIds,
    selectedId,
  ]);
  useHotkeys("r", () => onFocusReply(), { enabled: ativo, preventDefault: true });
  useHotkeys("a", () => onClaim(), { enabled: ativo, preventDefault: true });
  useHotkeys("e", () => onClose(), { enabled: ativo, preventDefault: true });
  useHotkeys("shift+/", () => onToggleHelp(), { enabled: ativo, preventDefault: true });
  useHotkeys("u", () => onMarkUnread?.(), { enabled: ativo && !!onMarkUnread, preventDefault: true }, [onMarkUnread]);
  useHotkeys("p", () => onTogglePin?.(), { enabled: ativo && !!onTogglePin, preventDefault: true }, [onTogglePin]);

  return null;
}
