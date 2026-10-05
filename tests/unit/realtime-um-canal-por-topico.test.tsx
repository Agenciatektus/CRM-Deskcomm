import { act, render, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ModuloDoCanal from "@/hooks/realtime/useRealtimeChannel";

/**
 * UM CANAL POR TÓPICO (auditoria de desempenho, item 10).
 *
 * Com o inbox aberto e uma conversa selecionada a aba abria 10 canais — um por
 * chamada de `useRealtimeChannel`, cada uma com sufixo próprio —, e vários eram
 * o mesmo tópico visto por dois hooks. Aqui os hooks REAIS da tela são montados
 * juntos (os dois que dependem de WebRTC/roteador entram pela topologia que
 * declaram, copiada abaixo) e o que se conta é `supabase.channel()`.
 *
 * Antes: 10 chamadas de hook → 10 canais. Depois: as mesmas 10 → 7 canais.
 */

type Cb = (s: string) => void;
type Ligacao = { tipo: string; filtro: Record<string, unknown>; handler: (p: unknown) => void };
interface CanalFalso {
  nome: string;
  ligacoes: Ligacao[];
  on: (tipo: string, filtro: Record<string, unknown>, h: (p: unknown) => void) => CanalFalso;
  subscribe: (cb: Cb) => CanalFalso;
  cb?: Cb;
}

const mock = vi.hoisted(() => ({
  canais: [] as CanalFalso[],
  removidos: [] as CanalFalso[],
  /** Nome de cada chamada de `useRealtimeChannel` na tela (um Set: render repete). */
  assinaturas: new Set<string>(),
}));

vi.mock("@/hooks/realtime/useRealtimeChannel", async (original) => {
  const real = await original<typeof ModuloDoCanal>();
  return {
    ...real,
    useRealtimeChannel: (o: Parameters<typeof real.useRealtimeChannel>[0]) => {
      mock.assinaturas.add(o.name);
      return real.useRealtimeChannel(o);
    },
  };
});

vi.mock("@/lib/supabase/browser", () => ({
  prepareRealtimeAuthentication: async () => {},
  createClient: () => ({
    channel: (nome: string) => {
      const canal: CanalFalso = {
        nome,
        ligacoes: [],
        on(tipo, filtro, h) {
          canal.ligacoes.push({ tipo, filtro, handler: h });
          return canal;
        },
        subscribe(cb) {
          canal.cb = cb;
          return canal;
        },
      };
      mock.canais.push(canal);
      return canal;
    },
    removeChannel: (c: CanalFalso) => {
      mock.removidos.push(c);
      return Promise.resolve("ok");
    },
  }),
}));

const ORG = "org-1";
const CONVERSA = "c-1";
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ orgId: "org-1", role: "admin" }),
  useUser: () => ({ id: "u-1", email: "a@b.c", full_name: "A" }),
  usePermission: () => true,
  useAuth: () => ({ activeOrg: { orgId: "org-1" }, user: { id: "u-1" } }),
}));
vi.mock("@/lib/notifications/push_client", () => ({ syncPushSubscription: vi.fn() }));
vi.mock("@/hooks/realtime/useRefetchDeSeguranca", () => ({
  useRefetchDeSeguranca: () => ({ divergencias: 0, ultimaDivergencia: null, ultimaVerificacao: null }),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: () => new Promise(() => {}) } }));

import { canaisAbertos } from "@/hooks/realtime/canaisCompartilhados";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { useInboundCallAlerts } from "@/hooks/calls/useInboundCallAlerts";
import { useConversationNotes } from "@/hooks/inbox/useConversationNotes";
import { useConversationsRealtime } from "@/hooks/inbox/useConversationsRealtime";
import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import { usePassagensDaConversa } from "@/hooks/inbox/usePassagensDaConversa";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";

const FILTROS = { status: "open" as const };

function Tela() {
  // app/app/layout.tsx → InterfaceRefresh (topologia copiada de hooks/auth/InterfaceRefresh.tsx)
  useRealtimeChannel({
    name: `interface:u-1:${ORG}`,
    postgresChanges: { event: "UPDATE", table: "user_organizations", filter: "user_id=eq.u-1" },
    onChange: () => {},
  });
  // app/app/layout.tsx → VoiceCallProvider (topologia copiada de hooks/voice/useVoiceCallSession.ts)
  useRealtimeChannel({
    name: "voice-calls",
    postgresChanges: { event: "*", table: "voice_calls", filter: `organization_id=eq.${ORG}` },
    onChange: () => {},
  });
  // AppShell
  useInboundMessageAlerts();
  useInboundCallAlerts();
  useCrmAlerts();
  // InboxLayout + ChatThread
  useConversationsRealtime(FILTROS, ORG);
  useMessagesRealtime(CONVERSA, ORG);
  useConversationNotes(CONVERSA);
  usePassagensDaConversa(CONVERSA);
  return null;
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mock.assinaturas.clear();
  mock.canais = [];
  mock.removidos = [];
});
afterEach(() => vi.useRealTimers());

describe("inbox com conversa aberta", () => {
  it("10 assinaturas de hook viram 7 canais", async () => {
    const { unmount } = render(<Tela />, { wrapper });
    await act(async () => {});
    expect(mock.assinaturas.size).toBe(10);
    expect(mock.canais.map((c) => c.nome.replace(/~\d+#\d+$/, "")).sort()).toMatchInlineSnapshot(`
      [
        "pg:public:conversation_notes:*:organization_id=eq.org-1",
        "pg:public:conversations:*:organization_id=eq.org-1",
        "pg:public:crm_leads:UPDATE:organization_id=eq.org-1",
        "pg:public:messages:*:conversation_id=eq.c-1",
        "pg:public:messages:INSERT:organization_id=eq.org-1",
        "pg:public:user_organizations:UPDATE:user_id=eq.u-1",
        "pg:public:voice_calls:*:organization_id=eq.org-1",
      ]
    `);
    expect(mock.canais).toHaveLength(7);
    unmount();
    // Sair da tela fecha TODOS — nenhum órfão.
    expect(mock.removidos).toHaveLength(7);
    expect(canaisAbertos()).toEqual([]);
  });
});

describe("compartilhar não perde evento", () => {
  function emitir(canal: CanalFalso, payload: unknown) {
    act(() => canal.ligacoes[0]!.handler(payload));
  }

  it("cada assinante recebe o seu recorte do mesmo canal", async () => {
    const todos: unknown[] = [];
    const soInsert: unknown[] = [];
    const topo = { event: "*" as const, table: "voice_calls", filter: "organization_id=eq.org-9" };
    const a = renderHook(() => useRealtimeChannel({ name: "a", postgresChanges: topo, onChange: (p) => todos.push(p) }));
    const b = renderHook(() =>
      useRealtimeChannel({
        name: "b",
        postgresChanges: topo,
        filtroLocal: { eventos: ["INSERT"] },
        onChange: (p) => soInsert.push(p),
      }),
    );
    await act(async () => {});
    expect(mock.canais).toHaveLength(1);
    const canal = mock.canais[0]!;
    act(() => canal.cb!("SUBSCRIBED"));
    expect(a.result.current.status).toBe("subscribed");
    expect(b.result.current.status).toBe("subscribed");

    emitir(canal, { eventType: "INSERT", new: { id: "1" } });
    emitir(canal, { eventType: "UPDATE", new: { id: "1" } });
    expect(todos).toHaveLength(2);
    expect(soInsert).toEqual([{ eventType: "INSERT", new: { id: "1" } }]);
    // O carimbo de entrega é de quem recebeu.
    expect(b.result.current.ultimaEntrega.current).not.toBeNull();

    // Um sai: o canal fica para o outro, e continua entregando.
    a.unmount();
    expect(mock.removidos).toHaveLength(0);
    emitir(canal, { eventType: "INSERT", new: { id: "2" } });
    expect(soInsert).toHaveLength(2);
    b.unmount();
    expect(mock.removidos).toEqual([canal]);
  });

  it("recorte por campo: outra conversa não chega; DELETE sem o campo chega (na dúvida, entrega)", async () => {
    const recebidos: unknown[] = [];
    const topo = { event: "*" as const, table: "conversation_notes", filter: "organization_id=eq.org-9" };
    const h = renderHook(() =>
      useRealtimeChannel({
        name: "n",
        postgresChanges: topo,
        filtroLocal: { campos: { conversation_id: "c-A" } },
        onChange: (p) => recebidos.push(p),
      }),
    );
    await act(async () => {});
    const canal = mock.canais[0]!;
    emitir(canal, { eventType: "INSERT", new: { id: "1", conversation_id: "c-B" } });
    emitir(canal, { eventType: "INSERT", new: { id: "2", conversation_id: "c-A" } });
    emitir(canal, { eventType: "DELETE", old: { id: "3" } });
    emitir(canal, { tipo: "reassinado" });
    expect(recebidos.map((p) => (p as { new?: { id: string }; old?: { id: string } }).new?.id ?? (p as { old?: { id: string } }).old?.id ?? "sintetico")).toEqual([
      "2",
      "3",
      "sintetico",
    ]);
    h.unmount();
  });

  it("um assinante que lança não cala o outro", async () => {
    vi.useFakeTimers();
    const recebidos: unknown[] = [];
    const topo = { event: "*" as const, table: "t", filter: "x=eq.1" };
    const a = renderHook(() =>
      useRealtimeChannel({ name: "a", postgresChanges: topo, onChange: () => { throw new Error("quebrou"); } }),
    );
    const b = renderHook(() => useRealtimeChannel({ name: "b", postgresChanges: topo, onChange: (p) => recebidos.push(p) }));
    await act(async () => {});
    const erros: unknown[] = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        erros.push(e);
      }
    };
    try {
      emitir(mock.canais[0]!, { eventType: "INSERT", new: { id: "1" } });
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(recebidos).toHaveLength(1);
    expect(erros).toHaveLength(1);
    a.unmount();
    b.unmount();
  });
});
