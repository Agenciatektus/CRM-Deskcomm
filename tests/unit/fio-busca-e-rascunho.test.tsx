import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as ReactVirtual from "@tanstack/react-virtual";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";
import { simularLayoutDoFio } from "@/tests/helpers/layout-do-fio";

/**
 * P2 do Cassio na #95 (fio virtualizado), medidos no ChatThread real com o
 * layout simulado de `layout-do-fio.ts`:
 *
 * 1. a busca chama `scrollToIndex` UMA vez por ocorrência — antes, a cada
 *    render até a bolha montar, o que prendia a rolagem na ocorrência;
 * 2. a bolha em edição que sai da tela (e desmonta) volta com o rascunho.
 *
 * Mutantes conferidos: sem o `rolouAte`, o caso 1 conta uma chamada por render;
 * com o rascunho de volta só no estado da bolha, o caso 2 volta sem editor.
 */

const estado = vi.hoisted(() => ({ paginas: [] as unknown[][] }));
const pedidos = vi.hoisted(() => ({ scrollToIndex: [] as number[], engolir: false }));

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const m = await importOriginal<typeof ReactVirtual>();
  const espiados = new WeakSet<object>();
  return {
    ...m,
    useVirtualizer: (opcoes: Parameters<typeof m.useVirtualizer>[0]) => {
      const v = m.useVirtualizer(opcoes);
      if (!espiados.has(v)) {
        espiados.add(v);
        const original = v.scrollToIndex.bind(v);
        v.scrollToIndex = (indice, o) => {
          pedidos.scrollToIndex.push(indice);
          // `engolir`: o pedido não rola (a bolha nunca monta), o cenário em
          // que o efeito antigo ficava pedindo de novo a cada render.
          if (!pedidos.engolir) original(indice, o);
        };
      }
      return v;
    },
  };
});
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
vi.mock("@/hooks/inbox/useAlterarMensagem", () => ({
  useAlterarMensagem: () => {
    const m = { mutateAsync: vi.fn(async () => undefined) };
    return { editar: m, apagar: m, ocultar: m, restaurar: m };
  },
}));
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => [] }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent", orgId: "o1" }),
  useUser: () => ({ id: "u-1" }),
}));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => null }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));

import { ChatThread } from "@/components/inbox/ChatThread";

const BASE = Date.now() - 2000 * 60_000;

/** Mensagem `n`, uma por minuto; as pares são nossas (editáveis por u-1 se recentes). */
function msg(n: number, body = `mensagem ${n}`): Message {
  const sentAt = new Date(BASE + n * 60_000).toISOString();
  const nossa = n % 2 === 0;
  return {
    id: `m-${n}`,
    organization_id: "o1",
    conversation_id: "c-1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: `wa-${n}`,
    type: "text",
    direction: nossa ? "outbound" : "inbound",
    status: "delivered",
    ack: null,
    error_code: null,
    error_message: null,
    body,
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: nossa ? "user" : null,
    sent_by_user_id: nossa ? "u-1" : null,
    sent_at: sentAt,
    delivered_at: null,
    read_at: null,
    metadata: null,
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: sentAt,
  } as unknown as Message;
}
const faixa = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => msg(de + i));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
let layout: ReturnType<typeof simularLayoutDoFio>;
const original = Element.prototype.scrollIntoView;
const rolar = vi.fn();
const rolador = (c: HTMLElement) => c.querySelector<HTMLElement>(".overflow-y-auto")!;

beforeEach(() => {
  qc = new QueryClient();
  estado.paginas = [];
  pedidos.scrollToIndex = [];
  pedidos.engolir = false;
  layout = simularLayoutDoFio({ alturaDaTela: 600, alturaDaLinha: 60 });
  rolar.mockReset();
  rolar.mockImplementation(function (this: Element) {
    const sc = this.closest<HTMLElement>(".overflow-y-auto");
    if (sc && this === sc.lastElementChild) layout.rolarAoFim(sc);
  });
  Element.prototype.scrollIntoView = rolar;
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
  layout.desfazer();
});

describe("busca no fio virtualizado", () => {
  it("pede a rolagem até a ocorrência uma vez só, e de novo só quando a ocorrência muda", async () => {
    estado.paginas = [[msg(1, "segue o BOLETO"), ...faixa(2, 1500), msg(1501, "o PIX caiu"), ...faixa(1502, 2000)]];
    const { container, rerender } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});
    pedidos.engolir = true;

    rerender(<ChatThread conversationId="c-1" searchTerm="boleto" />);
    await act(async () => {});
    expect(pedidos.scrollToIndex).toHaveLength(1);

    // A pessoa rola (e cada rolagem re-renderiza o fio) com a bolha ainda fora:
    // ninguém a puxa de volta para a ocorrência.
    const sc = rolador(container);
    for (const top of [100_000, 90_000, 80_000]) {
      await act(async () => layout.rolarPara(sc, top));
      rerender(<ChatThread conversationId="c-1" searchTerm="boleto" />);
      await act(async () => {});
    }
    expect(pedidos.scrollToIndex).toHaveLength(1);
    expect(sc.scrollTop).toBe(80_000);

    // Ocorrência nova: pede de novo, uma vez.
    rerender(<ChatThread conversationId="c-1" searchTerm="pix" />);
    await act(async () => {});
    rerender(<ChatThread conversationId="c-1" searchTerm="pix" />);
    await act(async () => {});
    expect(pedidos.scrollToIndex).toHaveLength(2);
  });
});

describe("rascunho da edição no fio virtualizado", () => {
  it("a bolha em edição que sai da tela volta com o rascunho e o editor aberto", async () => {
    const user = userEvent.setup();
    estado.paginas = [faixa(1, 2000)];
    const { container } = render(<ChatThread conversationId="c-1" provider="waha" />, { wrapper });
    await act(async () => {});

    // A última mensagem (2000) é nossa e recente: dá para editar.
    const ultima = [...container.querySelectorAll<HTMLElement>('[data-testid="message-bubble"]')].find((b) =>
      b.textContent?.includes("mensagem 2000"),
    )!;
    const linha = ultima.closest<HTMLElement>("[data-index]")!;
    await user.click(linha.querySelector<HTMLElement>('button[aria-label="Opções da mensagem"]')!);
    await user.click(await screen.findByRole("menuitem", { name: "Editar mensagem" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Editar mensagem" }), {
      target: { value: "rascunho que não pode sumir" },
    });

    // Sai da tela: a bolha desmonta.
    const sc = rolador(container);
    await act(async () => layout.rolarPara(sc, 0));
    expect(screen.queryByRole("textbox", { name: "Editar mensagem" })).toBeNull();
    expect(container.textContent).not.toContain("mensagem 2000");

    // Volta: o editor reabre com o que estava sendo digitado.
    await act(async () => layout.rolarAoFim(sc));
    const campo = screen.getByRole("textbox", { name: "Editar mensagem" }) as HTMLTextAreaElement;
    expect(campo.value).toBe("rascunho que não pode sumir");

    // Cancelar descarta: sair e voltar não reabre.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await act(async () => layout.rolarPara(sc, 0));
    await act(async () => layout.rolarAoFim(sc));
    expect(screen.queryByRole("textbox", { name: "Editar mensagem" })).toBeNull();
  });
});
