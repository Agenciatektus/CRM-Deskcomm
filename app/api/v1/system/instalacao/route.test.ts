import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pode: true,
  retrato: null as unknown,
}));
const provarSaldo = vi.hoisted(() => vi.fn(async () => ({ saldo: "ok" })));

vi.mock("@/lib/api/wrappers", () => ({
  ok: (b: unknown) => ({ corpo: b }),
  fail: (b: unknown) => ({ erro: b }),
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, org: { orgId: "org-1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/selectable", () => ({ listSelectableChannels: async () => [] }));
vi.mock("@/lib/cobranca/ia-propria", () => ({
  MENSAGEM_IA_PROPRIA_SEM_CREDENCIAL: "ia propria sem credencial",
  instalacaoPodeServirIaViaRpc: async () => state.pode,
}));
vi.mock("@/lib/instalacao/prova-de-credito", () => ({ provarSaldo }));
vi.mock("@/lib/ai/credentials", () => ({
  loadCredential: async () => ({ apiKey: "chave-da-org" }),
  CredentialUnavailableError: class extends Error {},
}));
vi.mock("@/lib/instalacao/retrato", async () => {
  const real = await vi.importActual<typeof import("@/lib/instalacao/retrato")>("@/lib/instalacao/retrato");
  return {
    ...real,
    lerRetratoDaInstalacao: async (deps: { instalacaoPodeServirIa?: () => Promise<boolean> }) => {
      const iaPropria = deps.instalacaoPodeServirIa ? !(await deps.instalacaoPodeServirIa()) : false;
      return {
        inteligencia: {
          provedor: "anthropic",
          origemDaChave: iaPropria ? "nenhuma" : "instalacao",
          chaveEmVerificacao: false,
          iaPropria,
          chaveDaOrg: null,
          modeloCurado: "claude-x",
        },
      };
    },
  };
});

import { GET } from "./route";

const req = () => ({ nextUrl: new URL("http://x/api/v1/system/instalacao?provar=1") }) as never;

beforeEach(() => {
  provarSaldo.mockClear();
  process.env.ANTHROPIC_API_KEY = "chave-da-instalacao";
});

describe("GET ?provar=1", () => {
  it("plano com IA propria: nao prova saldo com a chave da instalacao", async () => {
    state.pode = false;
    const r = (await GET(req())) as { corpo: { prova: { feita: boolean; motivo: string } } };
    expect(provarSaldo).not.toHaveBeenCalled();
    expect(r.corpo.prova.feita).toBe(false);
    expect(r.corpo.prova.motivo).toBe("ia propria sem credencial");
  });
  it("controle negativo: sem plano, prova com a chave da instalacao como hoje", async () => {
    state.pode = true;
    await GET(req());
    expect(provarSaldo).toHaveBeenCalledTimes(1);
    expect(provarSaldo).toHaveBeenCalledWith("anthropic", "chave-da-instalacao", "claude-x");
  });
});
