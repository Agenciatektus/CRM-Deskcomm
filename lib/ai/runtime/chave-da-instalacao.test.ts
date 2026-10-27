import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ serve: true, chamadas: 0 }));

vi.mock("@/lib/cobranca/ia-propria", () => ({
  MENSAGEM_IA_PROPRIA_SEM_CREDENCIAL: "msg",
  instalacaoPodeServirIaViaRpc: async () => {
    state.chamadas += 1;
    return state.serve;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
// agent.ts importa o runtime inteiro; só a função da chave é exercitada aqui.
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: vi.fn() }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn(), streamText: vi.fn(), stepCountIs: vi.fn() }));

import { chaveDaInstalacaoParaOrg } from "./agent";

beforeEach(() => {
  state.serve = true;
  state.chamadas = 0;
  process.env.OPENAI_API_KEY = "sk-instalacao";
});

describe("chaveDaInstalacaoParaOrg", () => {
  it("CONTROLE NEGATIVO: plano com IA própria + chave no env -> bloqueada, sem chave", async () => {
    state.serve = false;
    expect(await chaveDaInstalacaoParaOrg("org-1", "openai")).toEqual({ apiKey: null, bloqueada: true });
  });

  it("não-regressão: a instalação serve -> chave do env como hoje", async () => {
    expect(await chaveDaInstalacaoParaOrg("org-1", "openai")).toEqual({ apiKey: "sk-instalacao", bloqueada: false });
  });

  it("sem chave no env nem consulta o banco", async () => {
    delete process.env.OPENAI_API_KEY;
    expect(await chaveDaInstalacaoParaOrg("org-1", "openai")).toEqual({ apiKey: null, bloqueada: false });
    expect(state.chamadas).toBe(0);
  });
});
