/**
 * Caminho legado da IA (`ai-response-worker`, acordado pelo gatilho de INSERT):
 * reação não pede resposta. Um 👍 numa proposta não pode virar turno do agente.
 *
 * Controle: o texto normal passa da guarda (o motivo do skip, se houver, é
 * outro, mais adiante no pipeline).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ get env() { return { ANTHROPIC_API_KEY: "", AI_GATEWAY_API_KEY: "" }; } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { processMessageReceived } from "@/workers/ai-response-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG = "23000000-0000-4000-8000-000000000001";
const CONV = "23000000-0000-4000-8000-000000000002";
const MSG = "23000000-0000-4000-8000-000000000003";
const CONTATO = "23000000-0000-4000-8000-000000000004";

function armar(mensagem: Record<string, unknown>) {
  const linhas: Record<string, unknown> = {
    conversations: {
      id: CONV, organization_id: ORG, contact_id: CONTATO,
      channel_session_id: "23000000-0000-4000-8000-000000000005",
      last_inbound_at: new Date().toISOString(), bot_silenced_until: null, last_handoff_at: null,
      assignee_kind: "ai",
      contacts: { id: CONTATO, display_name: null, locale: "pt-BR", is_blocked: false, force_human: false },
    },
    messages: { id: MSG, organization_id: ORG, direction: "inbound", service_revision: 1, ...mensagem },
  };
  const from = (tabela: string) => {
    const terminais: Record<string, unknown> = {
      maybeSingle: () => Promise.resolve({ data: linhas[tabela] ?? null, error: null }),
      single: () => Promise.resolve({ data: linhas[tabela] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    };
    const chain: unknown = new Proxy(terminais, {
      get: (alvo, prop) => (prop in alvo ? alvo[prop as string] : () => chain),
    });
    return chain;
  };
  const rpc = () => Promise.resolve({ data: null, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>);
}

const evento = { organization_id: ORG, entity_id: MSG, payload: { message_id: MSG, conversation_id: CONV } } as unknown as EventRow;

beforeEach(() => vi.clearAllMocks());

describe("caminho legado: reação não acorda a IA", () => {
  it("reação: skip com motivo próprio", async () => {
    armar({ type: "reaction", body: "👍", media_url: null, media_storage_path: null });
    const r = await processMessageReceived(evento);
    expect(r).toMatchObject({ status: "skipped", reason: "reaction_inbound" });
  });

  it("tipo não suportado (sem corpo, sem mídia): skip por corpo vazio", async () => {
    armar({ type: "text", body: null, media_url: null, media_storage_path: null });
    const r = await processMessageReceived(evento);
    expect(r).toMatchObject({ status: "skipped", reason: "empty_inbound_body" });
  });

  it("controle: texto normal passa da guarda", async () => {
    armar({ type: "text", body: "bom dia, qual o prazo?", media_url: null, media_storage_path: null });
    const r = await processMessageReceived(evento);
    expect(r.status === "skipped" ? r.reason : null).not.toBe("reaction_inbound");
    expect(r.status === "skipped" ? r.reason : null).not.toBe("empty_inbound_body");
  });
});
