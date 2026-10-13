/**
 * O AVISO DO NAVEGADOR RESPEITA O SILÊNCIO DE QUEM ESTÁ LOGADO (migration 9042).
 *
 * O realtime de `messages` entrega a mensagem para a organização inteira; quem
 * silenciou a conversa (estado POR ATENDENTE, nas listas em cache) não é
 * avisado. Controle: a mesma mensagem numa conversa não silenciada avisa.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastFalso, fetchFalso } = vi.hoisted(() => ({ toastFalso: vi.fn(), fetchFalso: vi.fn() }));
const canal = vi.hoisted(() => ({ onChange: null as ((p: unknown) => void) | null }));

vi.mock("sonner", () => ({ toast: toastFalso }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: vi.fn() }));
vi.mock("@/lib/notifications/push_client", () => ({ syncPushSubscription: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useActiveOrg: () => ({ orgId: "org-1" }) }));
vi.mock("@/hooks/notifications/OpenConversationContext", () => ({ getOpenConversationId: () => null }));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: (opts: { onChange: (p: unknown) => void }) => {
    canal.onChange = opts.onChange;
    return { status: "subscribed", ultimaEntrega: { current: null } };
  },
}));

import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";

function montar(linhas: Array<Record<string, unknown>>) {
  const qc = new QueryClient();
  qc.setQueryData(["conversations", { status: ["open"] }], { pages: [{ data: linhas }], pageParams: [null] });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  renderHook(() => useInboundMessageAlerts(), { wrapper });
}

const mensagem = (conversa: string) => ({
  new: { id: `m-${conversa}`, direction: "inbound", conversation_id: conversa, contact_id: "ct-1", type: "text", body: "oi" },
});

beforeEach(() => {
  vi.clearAllMocks();
  canal.onChange = null;
  fetchFalso.mockImplementation(async () => ({ ok: true, status: 200, url: "https://x/a", json: async () => ({ data: { display_name: "Ana" } }) }));
  vi.stubGlobal("fetch", fetchFalso);
});

describe("aviso de mensagem nova x silêncio pessoal", () => {
  it("conversa silenciada por mim: nada de aviso (nem a busca do nome)", async () => {
    montar([{ id: "calada", muted_until: "infinity" }]);
    await waitFor(() => expect(canal.onChange).not.toBeNull());
    canal.onChange!(mensagem("calada"));
    await new Promise((r) => setTimeout(r, 30));
    expect(toastFalso).not.toHaveBeenCalled();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("CONTROLE: conversa não silenciada avisa", async () => {
    montar([{ id: "aberta", muted_until: null }]);
    await waitFor(() => expect(canal.onChange).not.toBeNull());
    canal.onChange!(mensagem("aberta"));
    await waitFor(() => expect(toastFalso).toHaveBeenCalled());
  });
});
