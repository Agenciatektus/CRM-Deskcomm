import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Com `WAHA_HABILITADO=false`, as rotas que CRIAM ou RECONECTAM sessão WAHA
 * respondem 403 `waha_desabilitado` sem tocar o transporte nem o banco. Ligado,
 * o guard é transparente: cada rota segue para a sua própria checagem (aqui, o
 * 503 `waha_not_configured` de quem não tem cliente), o que prova que o 403
 * vem do interruptor e não de um mock que recusa tudo.
 */
const h = vi.hoisted(() => ({
  role: vi.fn(),
  connect: vi.fn(),
  getClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role, orgAtivaDaApi: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: async () => false, loadAuthUser: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: h.from, rpc: h.from }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: h.from }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/waha/client", () => ({
  getWahaClient: h.getClient,
  wahaFriendlyError: (m: string) => m,
}));
vi.mock("@/lib/channels/connect-waha", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  connectWahaChannel: h.connect,
}));

import { POST as criarCanal } from "@/app/api/v1/channel-sessions/route";
import { POST as criarNoOnboarding } from "@/app/api/v1/onboarding/whatsapp/session/route";
import { POST as reconectar } from "@/app/api/v1/channel-sessions/[id]/reconnect/route";

const ID = "44444444-4444-4444-8444-444444444444";
const post = (url: string) =>
  new Request(`http://localhost${url}`, { method: "POST", body: "{}" });

const rotas: Array<[string, () => Promise<Response>]> = [
  ["POST /channel-sessions", () => criarCanal(post("/api/v1/channel-sessions") as never)],
  ["POST /onboarding/whatsapp/session", () => criarNoOnboarding(post("/x"))],
  [
    "POST /channel-sessions/[id]/reconnect",
    () => reconectar(post("/x") as never, { params: Promise.resolve({ id: ID }) }),
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  h.role.mockResolvedValue({
    ok: true,
    org: { orgId: "org-a" },
    user: { id: "admin", idioma: "pt-BR" },
  });
  h.getClient.mockReturnValue(null);
  // Canal sem sessão (oficial): a reconexão responde 422 por conta própria.
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) cadeia[m] = () => cadeia;
  cadeia.maybeSingle = async () => ({
    data: { id: ID, waha_session_name: null, archived_at: null },
    error: null,
  });
  h.from.mockReturnValue(cadeia);
});

describe.each(rotas)("%s", (_nome, chamar) => {
  it.each(["false", "0", "no", "FALSE"])("WAHA_HABILITADO=%s: 403 waha_desabilitado", async (v) => {
    vi.stubEnv("WAHA_HABILITADO", v);
    const res = await chamar();
    const corpo = await res.json();
    expect(res.status).toBe(403);
    expect(corpo.error.code).toBe("waha_desabilitado");
    expect(corpo.error.message).toBe(
      "O WhatsApp por WAHA foi desativado. Use Conectar WhatsApp (FZAP).",
    );
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
  });

  it("ligado (variável ausente ou true): o guard não interfere", async () => {
    for (const v of [undefined, "true", "1"]) {
      if (v === undefined) vi.stubEnv("WAHA_HABILITADO", "");
      else vi.stubEnv("WAHA_HABILITADO", v);
      const res = await chamar();
      expect(res.status).not.toBe(403);
    }
  });
});
