import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A MENSAGEM DO REALTIME ENTRA NO CACHE DA THREAD — SEM RECARREGAR (item 9).
 *
 * O instrumento é a contagem de GETs em `/conversations/{id}/messages`: abrir a
 * conversa custa 1. Antes, cada mensagem recebida custava mais 1 (por página
 * carregada). O controle positivo de que o contador enxerga refetch está no
 * caso "reassinado": ali a recarga É o comportamento certo, e ela aparece.
 */

const mock = vi.hoisted(() => ({
  gets: 0,
  pagina: [] as Array<Record<string, unknown>>,
  hasMore: false,
  onChange: null as null | ((p: unknown) => void),
}));

vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: (o: { onChange: (p: unknown) => void }) => {
    mock.onChange = o.onChange;
    return { status: "subscribed", ultimaEntrega: { current: null } };
  },
}));
vi.mock("@/hooks/realtime/useRefetchDeSeguranca", () => ({
  useRefetchDeSeguranca: () => ({ divergencias: 0, ultimaDivergencia: null, ultimaVerificacao: null }),
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: async (url: string) => {
      if (url.includes("/messages")) mock.gets++;
      return { data: mock.pagina.map((m) => ({ ...m })), meta: { cursor: null, has_more: mock.hasMore } };
    },
  },
}));

import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import type { Message } from "@/lib/types/messaging";

const ORG = "org-1";
const CONV = "c-1";

function msg(id: string, sentAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    organization_id: ORG,
    conversation_id: CONV,
    channel_session_id: "s-1",
    contact_id: "k-1",
    external_id: `wa-${id}`,
    type: "text",
    direction: "inbound",
    status: "received",
    body: `texto ${id}`,
    media_storage_path: null,
    sent_at: sentAt,
    created_at: sentAt,
    ...extra,
  };
}

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function abrir(orgId: string | null = ORG) {
  const h = renderHook(() => useMessagesRealtime(CONV, orgId), { wrapper });
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  return h;
}

function ids(): string[] {
  const d = qc.getQueryData<InfiniteData<{ data: Message[] }>>(["messages", CONV]);
  return d?.pages.flatMap((p) => p.data.map((m) => m.id)) ?? [];
}

async function evento(payload: unknown) {
  await act(async () => {
    mock.onChange!(payload);
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.gets = 0;
  mock.hasMore = false;
  // A rota devolve do mais novo para o mais velho.
  mock.pagina = [msg("m2", "2026-10-04T10:02:00Z"), msg("m1", "2026-10-04T10:01:00Z")];
});

describe("abrir a conversa e receber 3 mensagens", () => {
  it("1 requisição no total (antes: 4) — e as 3 entram em ordem", async () => {
    await abrir();
    expect(mock.gets).toBe(1);
    await evento({ eventType: "INSERT", new: msg("m3", "2026-10-04T10:03:00Z") });
    await evento({ eventType: "INSERT", new: msg("m5", "2026-10-04T10:05:00Z") });
    // Fora de ordem, mas dentro da janela carregada: entra no lugar certo.
    await evento({ eventType: "INSERT", new: msg("m4", "2026-10-04T10:04:00Z") });
    expect(ids()).toEqual(["m5", "m4", "m3", "m2", "m1"]);
    expect(mock.gets).toBe(1);
  });

  it("controle positivo: depois de uma queda do canal (reassinado) a thread recarrega", async () => {
    await abrir();
    await evento({ tipo: "reassinado" });
    await waitFor(() => expect(mock.gets).toBe(2));
  });
});

describe("deduplicação", () => {
  it("o mesmo id duas vezes não duplica", async () => {
    await abrir();
    const nova = msg("m3", "2026-10-04T10:03:00Z");
    await evento({ eventType: "INSERT", new: nova });
    await evento({ eventType: "INSERT", new: nova });
    expect(ids()).toEqual(["m3", "m2", "m1"]);
    expect(mock.gets).toBe(1);
  });

  it("o mesmo id do provedor (external_id) com outro id não duplica", async () => {
    await abrir();
    await evento({ eventType: "INSERT", new: msg("eco", "2026-10-04T10:03:00Z", { external_id: "wa-m2" }) });
    expect(ids()).toEqual(["m2", "m1"]);
    expect(mock.gets).toBe(1);
  });

  it("a bolha otimista do envio é trocada pela real", async () => {
    await abrir();
    qc.setQueryData<InfiniteData<{ data: Array<Record<string, unknown>> }>>(["messages", CONV], (d) => ({
      ...d!,
      pages: [{ ...d!.pages[0]!, data: [...d!.pages[0]!.data, msg("temp-1", "2026-10-04T10:03:00Z", { direction: "outbound", body: "oi", metadata: { _optimistic: true } })] }],
    }));
    await evento({
      eventType: "INSERT",
      new: msg("m3", "2026-10-04T10:03:01Z", { direction: "outbound", body: "oi", metadata: {} }),
    });
    expect(ids()).toEqual(["m3", "m2", "m1"]);
  });
});

describe("DELETE só remove o que já está no cache", () => {
  it("id existente sai, sem refetch", async () => {
    await abrir();
    await evento({ eventType: "DELETE", old: { id: "m1" } });
    expect(ids()).toEqual(["m2"]);
    expect(mock.gets).toBe(1);
  });

  it("id desconhecido (DELETE não passa pela RLS nem pelo filtro) não muda nada nem recarrega", async () => {
    await abrir();
    await evento({ eventType: "DELETE", old: { id: "de-outra-org" } });
    expect(ids()).toEqual(["m2", "m1"]);
    expect(mock.gets).toBe(1);
  });
});

describe("o que não é desta conversa nunca entra", () => {
  it("outra organização", async () => {
    await abrir();
    await evento({ eventType: "INSERT", new: msg("x", "2026-10-04T10:09:00Z", { organization_id: "org-2" }) });
    await evento({ eventType: "UPDATE", new: msg("m1", "2026-10-04T10:01:00Z", { organization_id: "org-2", body: "invadido" }) });
    expect(ids()).toEqual(["m2", "m1"]);
    const m1 = qc.getQueryData<InfiniteData<{ data: Message[] }>>(["messages", CONV])!.pages[0]!.data[1]!;
    expect(m1.body).toBe("texto m1");
    expect(mock.gets).toBe(1);
  });

  it("outra conversa", async () => {
    await abrir();
    await evento({ eventType: "INSERT", new: msg("y", "2026-10-04T10:09:00Z", { conversation_id: "c-2" }) });
    expect(ids()).toEqual(["m2", "m1"]);
  });

  it("sem organização ativa conhecida, nada entra do payload: o servidor decide", async () => {
    await abrir(null);
    await evento({ eventType: "INSERT", new: msg("m3", "2026-10-04T10:03:00Z") });
    await waitFor(() => expect(mock.gets).toBe(2));
    expect(ids()).toEqual(["m2", "m1"]);
  });

  it("colunas fora do formato da rota não entram no cache", async () => {
    await abrir();
    await evento({ eventType: "INSERT", new: msg("m3", "2026-10-04T10:03:00Z", { coluna_interna: "segredo" }) });
    const m3 = qc.getQueryData<InfiniteData<{ data: Array<Record<string, unknown>> }>>(["messages", CONV])!.pages[0]!.data[0]!;
    expect(m3.id).toBe("m3");
    expect("coluna_interna" in m3).toBe(false);
  });
});

describe("status (entregue/lido) atualiza a linha sem refetch", () => {
  it("UPDATE de status", async () => {
    await abrir();
    await evento({
      eventType: "UPDATE",
      new: msg("m2", "2026-10-04T10:02:00Z", { status: "read", read_at: "2026-10-04T10:06:00Z" }),
    });
    const m2 = qc.getQueryData<InfiniteData<{ data: Message[] }>>(["messages", CONV])!.pages[0]!.data[0]!;
    expect(m2.status).toBe("read");
    expect(m2.read_at).toBe("2026-10-04T10:06:00Z");
    expect(mock.gets).toBe(1);
  });

  it("UPDATE de mensagem que devia estar na janela e não está = buraco → refetch", async () => {
    await abrir();
    await evento({ eventType: "UPDATE", new: msg("perdida", "2026-10-04T10:03:00Z", { status: "delivered" }) });
    await waitFor(() => expect(mock.gets).toBe(2));
  });

  it("UPDATE que troca o caminho da mídia → refetch (a URL assinada vem do servidor)", async () => {
    await abrir();
    await evento({ eventType: "UPDATE", new: msg("m2", "2026-10-04T10:02:00Z", { media_storage_path: "org-1/x.jpg" }) });
    await waitFor(() => expect(mock.gets).toBe(2));
  });
});

describe("reserva", () => {
  it("payload incompleto (sem sent_at) → refetch, nada entra", async () => {
    await abrir();
    const incompleta = msg("m3", "2026-10-04T10:03:00Z");
    delete incompleta.sent_at;
    await evento({ eventType: "INSERT", new: incompleta });
    await waitFor(() => expect(mock.gets).toBe(2));
  });

  it("mensagem mais velha que a janela, com histórico além dela → refetch", async () => {
    mock.hasMore = true;
    await abrir();
    await evento({ eventType: "INSERT", new: msg("velha", "2026-10-01T00:00:00Z") });
    await waitFor(() => expect(mock.gets).toBe(2));
  });
});
