import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A coluna de conversa do dossiê (Kanban) — o que ela decide sozinha:
 *   1. `mark-read` só para o DONO da conversa e só com a coluna visível. O
 *      Kanban é tela de revisão: o gestor passando pelos cards não leu pelo
 *      atendente, e o contador zerado é o do atendente;
 *   2. a conversa é relida quando o quadro (ao vivo) vê atividade nova — sem
 *      isso a janela de 24h ficava velha e o composer travado depois de o
 *      cliente escrever.
 */

const marcadas: Array<string | null> = [];
const invalidadas: unknown[] = [];
const estado = { dono: "u-dono" as string | null };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-dono" }, activeOrg: { orgId: "o1", role: "agent" } }),
  usePermission: () => true,
}));
const traduzir = Object.assign((texto: string) => texto, { t: (texto: string) => texto });
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => traduzir }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (a: unknown) => invalidadas.push(a) }),
}));
vi.mock("@/hooks/inbox/useMarkAsRead", () => ({
  useMarkAsRead: (id: string | null) => marcadas.push(id),
}));
vi.mock("@/hooks/inbox/useConversation", () => ({
  isNotFound: () => false,
  useConversation: (id: string) => ({
    isPending: false,
    error: null,
    data: {
      id,
      contact_id: "ct-1",
      status: "open",
      assigned_to_user_id: estado.dono,
      unread_count_for_assignee: 2,
      contacts: { id: "ct-1", name: "Maria" },
      channel_sessions: { phone_number: "+5522999990000", display_name: null, provider: "verdash" },
    },
  }),
}));
vi.mock("@/hooks/notifications/OpenConversationContext", () => ({
  OpenConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/inbox/PainelDaConversa", () => ({ PainelDaConversa: () => <div /> }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { ConversaDoNegocio } from "@/components/kanban/ConversaDoNegocio";

beforeEach(() => {
  marcadas.length = 0;
  invalidadas.length = 0;
  estado.dono = "u-dono";
});

describe("mark-read no dossiê", () => {
  it("dono + coluna visível: marca como lida", () => {
    render(<ConversaDoNegocio conversationId="c1" visivel atividadeNoBoard={null} />);
    expect(marcadas.at(-1)).toBe("c1");
  });

  it("coluna escondida: não marca, mesmo sendo o dono", () => {
    render(<ConversaDoNegocio conversationId="c1" visivel={false} atividadeNoBoard={null} />);
    expect(marcadas.every((id) => id === null)).toBe(true);
  });

  it("quem NÃO é o dono não zera o contador do atendente", () => {
    estado.dono = "u-outro-atendente";
    render(<ConversaDoNegocio conversationId="c1" visivel atividadeNoBoard={null} />);
    expect(marcadas.every((id) => id === null)).toBe(true);
  });
});

describe("a conversa acompanha o quadro ao vivo", () => {
  it("atividade nova no board relê a conversa (janela de 24h não fica velha)", () => {
    const { rerender } = render(
      <ConversaDoNegocio conversationId="c1" visivel atividadeNoBoard="2026-09-24T10:00:00Z" />,
    );
    const antes = invalidadas.length;
    rerender(<ConversaDoNegocio conversationId="c1" visivel atividadeNoBoard="2026-09-24T10:05:00Z" />);
    expect(invalidadas.length).toBe(antes + 1);
    expect(invalidadas.at(-1)).toEqual({ queryKey: ["conversation", "c1"] });
  });
});
