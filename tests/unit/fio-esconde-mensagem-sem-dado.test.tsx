import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";
import { simularLayoutDoFio } from "@/tests/helpers/layout-do-fio";

/**
 * Ruído de protocolo (sem texto, mídia nem metadata) não vira bolha
 * "Mensagem sem conteúdo" no fio; o que tem qualquer dado continua aparecendo.
 */
const estado = vi.hoisted(() => ({ paginas: [] as unknown[][] }));

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/hooks/inbox/useMessagesRealtime", () => ({
  useMessagesRealtime: () => ({
    data: { pages: estado.paginas.map((data) => ({ data })) },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => [] }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent" }),
  useUser: () => ({ id: "u-1" }),
}));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => null }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));

import { ChatThread } from "@/components/inbox/ChatThread";

function msg(n: number, extra: Partial<Message>): Message {
  const sentAt = new Date(Date.UTC(2026, 9, 1, 12, n)).toISOString();
  return {
    id: `m-${n}`, organization_id: "o1", conversation_id: "c-1", channel_session_id: "s1",
    contact_id: "ct1", external_id: null, type: "text", direction: "inbound", status: "delivered",
    body: null, media_url: null, media_storage_path: null, metadata: {}, revoked_at: null,
    edited_at: null, reply_to_message_id: null, sent_at: sentAt, created_at: sentAt,
    ...extra,
  } as unknown as Message;
}

describe("fio esconde mensagem sem dado", () => {
  let layout: ReturnType<typeof simularLayoutDoFio>;
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    layout.desfazer();
    Element.prototype.scrollIntoView = original;
  });

  it("vazia some; texto e tipo não suportado ficam", async () => {
    layout = simularLayoutDoFio({ alturaDaTela: 600, alturaDaLinha: 60 });
    Element.prototype.scrollIntoView = vi.fn();
    estado.paginas = [[
      msg(1, { body: "oi" }),
      msg(2, {}),
      msg(3, { metadata: { tipo_nao_suportado: "pollCreationMessage" } }),
    ]];
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { container } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});

    expect(container.querySelectorAll('[data-testid="message-bubble"]')).toHaveLength(2);
    expect(container.textContent).toContain("oi");
    expect(container.textContent).toContain("pollCreationMessage");
    expect(container.textContent).not.toContain("Mensagem sem conteúdo");
  });
});
