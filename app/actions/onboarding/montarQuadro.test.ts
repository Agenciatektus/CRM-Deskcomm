import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ bloqueada: false, gerou: vi.fn() }));

// Cadeia do supabase: cada método devolve a própria cadeia; maybeSingle resolve por tabela.
const TABELAS: Record<string, unknown> = {
  ai_agents: { published_version_id: "v1" },
  ai_agent_versions: { provider: "openai", model: "gpt-x", credential_id: null },
  crm_pipelines: null,
};
function cadeia(tabela: string) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.maybeSingle = async () => ({ data: TABELAS[tabela] ?? null });
  c.then = (r: (v: unknown) => unknown) => r({ data: [] });
  return c;
}

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("ai", () => ({
  generateText: (...a: unknown[]) => {
    state.gerou(...a);
    return Promise.resolve({ text: "{}" });
  },
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: cadeia }) }));
vi.mock("@/lib/ai/credentials", () => ({ loadCredential: vi.fn() }));
vi.mock("@/lib/ai/runtime/agent", () => ({
  buildModel: () => ({}),
  chaveDaInstalacaoParaOrg: async () =>
    state.bloqueada ? { apiKey: null, bloqueada: true } : { apiKey: "sk-inst", bloqueada: false },
}));
vi.mock("@/lib/cobranca/ia-propria", () => ({ MENSAGEM_IA_PROPRIA_SEM_CREDENCIAL: "sem-credencial-propria" }));
vi.mock("./_shared", () => ({
  requireOnboardingCtx: async () => ({ orgId: "org-1", orgName: "Acme" }),
  loadOnboardingState: async () => ({ state: {} }),
  patchOnboardingState: vi.fn(),
  OnboardingError: class extends Error {},
}));

import { dadosDoPasso } from "./montarQuadro";

beforeEach(() => {
  state.bloqueada = false;
  state.gerou.mockClear();
});

describe("dadosDoPasso", () => {
  it("plano com IA própria sem credencial: NÃO chama generateText e cai no pacote", async () => {
    state.bloqueada = true;
    const r = await dadosDoPasso();
    expect(state.gerou).not.toHaveBeenCalled();
    expect(r.sugestao).toMatchObject({ origem: "pacote", porque: "sem-credencial-propria" });
  });

  it("CONTROLE NEGATIVO: instalação serve -> generateText é chamado", async () => {
    await dadosDoPasso();
    expect(state.gerou).toHaveBeenCalledTimes(1);
  });
});
