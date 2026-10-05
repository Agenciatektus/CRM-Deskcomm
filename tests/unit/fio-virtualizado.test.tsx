import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";
import { simularLayoutDoFio } from "@/tests/helpers/layout-do-fio";

/**
 * O FIO DA CONVERSA É VIRTUALIZADO (item 11 da auditoria de desempenho).
 *
 * Conversa longa montava TODAS as bolhas no DOM. Aqui a `MessageBubble` é a
 * real e o layout é simulado (janela de 600px, linha de 60px — ver
 * `layout-do-fio.ts`): o que se mede é o DOM que o navegador teria.
 *
 * As quatro promessas da tela continuam valendo e são medidas: só o visível
 * monta; mensagem nova leva ao fim; "Carregar mais antigas" não tira a leitura
 * do lugar; e a busca alcança uma bolha que não estava montada.
 */

const estado = vi.hoisted(() => ({
  paginas: [] as unknown[][],
  temMais: false,
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/hooks/inbox/useMessagesRealtime", () => ({
  useMessagesRealtime: () => ({
    data: { pages: estado.paginas.map((data) => ({ data })) },
    isLoading: false,
    isError: false,
    hasNextPage: estado.temMais,
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

/** Mensagem `n`, uma por minuto a partir de 24/09 12:00 UTC — vários dias em 2.000. */
function msg(n: number, body = `mensagem ${n}`): Message {
  const sentAt = new Date(Date.UTC(2026, 8, 24, 12, 0) + n * 60_000).toISOString();
  return {
    id: `m-${n}`,
    organization_id: "o1",
    conversation_id: "c-1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: null,
    type: "text",
    direction: n % 2 ? "inbound" : "outbound",
    status: "delivered",
    ack: null,
    error_code: null,
    error_message: null,
    body,
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: null,
    sent_by_user_id: null,
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

/** Faixa [de, ate] de mensagens, em ordem. */
const faixa = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => msg(de + i));

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
let layout: ReturnType<typeof simularLayoutDoFio>;
const original = Element.prototype.scrollIntoView;
const rolar = vi.fn();

const rolador = (c: HTMLElement) => c.querySelector<HTMLElement>(".overflow-y-auto")!;
const bolhas = (c: HTMLElement) => c.querySelectorAll('[data-testid="message-bubble"]');
/** O id da primeira mensagem cuja linha começa na tela, e onde ela está na janela. */
function topoDaLeitura(c: HTMLElement): { id: string; naJanela: number } {
  const sc = rolador(c);
  const linhas = [...sc.querySelectorAll<HTMLElement>("[data-index]")]
    .filter((el) => el.querySelector('[data-testid="message-bubble"]'))
    .map((el) => ({
      el,
      y: Number(/translateY\(([-\d.]+)px\)/.exec(el.style.transform)?.[1] ?? NaN),
    }))
    .filter((l) => l.y >= sc.scrollTop)
    .sort((a, b) => a.y - b.y);
  const primeira = linhas[0]!;
  return {
    id: primeira.el.querySelector('[data-testid="message-bubble"]')!.textContent ?? "",
    naJanela: primeira.y - sc.scrollTop,
  };
}

describe("ChatThread virtualizado", () => {
  beforeEach(() => {
    qc = new QueryClient();
    estado.paginas = [];
    estado.temMais = false;
    layout = simularLayoutDoFio({ alturaDaTela: 600, alturaDaLinha: 60 });
    rolar.mockReset();
    // A ancoragem ao fim usa o `scrollIntoView` da sentinela: aqui ele rola o
    // rolador até o fim, como o navegador faria.
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

  it("2.000 mensagens: só as visíveis montam no DOM, ancoradas no fim", async () => {
    estado.paginas = [faixa(1, 2000)];
    const { container } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});

    const montadas = bolhas(container).length;
    const nos = rolador(container).querySelectorAll("*").length;
    // Medida para o relatório da PR (não é asserção).
    console.info(`[fio] 2000 mensagens → ${montadas} bolhas montadas, ${nos} nós no rolador`);
    // Janela de 600px / 60px = 10 linhas + overscan de 8 para cada lado.
    expect(montadas).toBeGreaterThan(0);
    expect(montadas).toBeLessThanOrEqual(30);
    // A última mensagem está montada: a abertura vai ao fim.
    expect(container.textContent).toContain("mensagem 2000");
    expect(container.textContent).not.toContain("mensagem 1000");
  });

  it("mensagem nova com a leitura no fim: rola até ela", async () => {
    estado.paginas = [faixa(1, 2000)];
    const { container, rerender } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});
    rolar.mockClear();

    estado.paginas = [faixa(1, 2001)];
    rerender(<ChatThread conversationId="c-1" />);
    await act(async () => {});

    expect(rolar).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
    const sc = rolador(container);
    expect(sc.scrollTop).toBe(layout.maximo(sc));
    expect(container.textContent).toContain("mensagem 2001");
  });

  it("mensagem nova com a pessoa lendo o histórico: não a arranca de lá", async () => {
    estado.paginas = [faixa(1, 2000)];
    const { container, rerender } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});
    const sc = rolador(container);
    await act(async () => layout.rolarPara(sc, 30_000));
    const antes = topoDaLeitura(container);
    rolar.mockClear();

    estado.paginas = [faixa(1, 2001)];
    rerender(<ChatThread conversationId="c-1" />);
    await act(async () => {});

    expect(rolar).not.toHaveBeenCalled();
    expect(topoDaLeitura(container)).toEqual(antes);
  });

  it("'Carregar mais antigas' mantém a mesma mensagem no mesmo lugar da tela", async () => {
    // A thread pagina para o PASSADO: a página 2 traz as mais antigas.
    estado.paginas = [faixa(1001, 2000)];
    estado.temMais = true;
    const { container, rerender } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});
    const sc = rolador(container);
    // A pessoa subiu até perto do topo do que está carregado.
    await act(async () => layout.rolarPara(sc, 1_000));
    const antes = topoDaLeitura(container);
    const topoAntes = sc.scrollTop;

    estado.paginas = [faixa(1001, 2000), faixa(1, 1000)];
    rerender(<ChatThread conversationId="c-1" />);
    await act(async () => {});

    const depois = topoDaLeitura(container);
    console.info(
      `[fio] carregar mais: scrollTop ${topoAntes} → ${sc.scrollTop}; topo "${antes.id}" a ${antes.naJanela}px → "${depois.id}" a ${depois.naJanela}px`,
    );
    expect(depois).toEqual(antes);
    // E não voltou para o fim (o defeito que o efeito de ancoragem já evitava).
    expect(sc.scrollTop).toBeLessThan(layout.maximo(sc));
  });

  it("busca: leva até a primeira ocorrência mesmo quando ela não estava montada", async () => {
    estado.paginas = [[msg(1, "segue o BOLETO"), ...faixa(2, 2000)]];
    const { container, rerender } = render(<ChatThread conversationId="c-1" />, { wrapper });
    await act(async () => {});
    expect(container.querySelector('[data-search-match="true"]')).toBeNull();

    rerender(<ChatThread conversationId="c-1" searchTerm="boleto" />);
    await act(async () => {});
    await act(async () => {});

    const achada = container.querySelector('[data-search-match="true"]');
    expect(achada?.textContent).toContain("segue o BOLETO");
    expect((rolar.mock.contexts as Element[]).includes(achada!)).toBe(true);
  });
});
