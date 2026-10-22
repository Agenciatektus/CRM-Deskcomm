/**
 * ASSINATURA NÃO É CHAVE PAGA — `cost_cents = 0`, tokens gravados.
 *
 * O defeito (estudo de 21/10/2026): `costCents(model)` precifica pelo id do
 * modelo sem olhar o provedor. `gpt-5.6-luna` pela assinatura do ChatGPT
 * (`openai-assinatura`) somava o preço da API no gasto do mês
 * (`fn_gasto_de_ia_do_mes` = soma de `llm_calls.cost_cents`), e o teto de
 * `ai_budgets` via dinheiro que não saiu.
 *
 * Controle negativo: o MESMO modelo e o MESMO uso pelo provedor `openai` (chave
 * paga) gravam custo > 0. Sem ele, um 0 aqui poderia ser só um modelo sem preço
 * na tabela — e aí o teste passaria sem medir nada.
 */
import { describe, expect, it, vi } from "vitest";

import { generateText, streamText } from "ai";

import { costCents, custoGravavel, provedorSemCustoPorToken } from "@/lib/agent-engine/edge/llm/pricing";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { PROVEDOR_POR_ASSINATURA } from "@/lib/ai/pontos/provedores";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  stepCountIs: () => () => false,
  asSchema: vi.fn(),
  tool: (t: unknown) => t,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/ai/credenciais/login-codex", () => ({
  lerLoginCodexRenovandoSeProxima: vi.fn(async () => ({
    access_token: "token-de-assinatura-de-teste",
    refresh_token: "refresh-de-teste",
    expires_at: Date.now() + 60_000,
  })),
}));

const ORG = "33333333-3333-4333-8333-333333333333";
const MODELO = "gpt-5.6-luna";
const USO = { inputTokens: 42_000, outputTokens: 7_000, totalTokens: 49_000, inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 } };

/** Pool fingido; devolve os params de cada insert em `llm_calls`. */
function pool(provider: string) {
  const inserts: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("settings->'llm'")) {
      return {
        rows: [{ llm: { provider, default_model: MODELO, params: {}, enabled_models: [], monthly_budget_cents: null } }],
      };
    }
    if (sql.includes("insert into llm_calls")) {
      inserts.push(params);
      return { rows: [{ id: "call-1" }] };
    }
    return { rows: [] };
  });
  return { pool: { query } as never, inserts };
}

const modelo = (provider: string) => () => ({
  specificationVersion: "v3",
  provider,
  modelId: MODELO,
  doGenerate: async () => {
    throw new Error("SENTINELA: o SDK de verdade foi chamado");
  },
  doStream: async () => {
    throw new Error("SENTINELA: o SDK de verdade foi chamado");
  },
});
const registry = { "openai-assinatura": modelo("openai-assinatura"), openai: modelo("openai") } as never;

function dubles() {
  vi.mocked(streamText).mockReturnValue({
    text: Promise.resolve("ok"),
    usage: Promise.resolve(USO),
    response: Promise.resolve({ id: "resp-1", modelId: MODELO }),
    steps: Promise.resolve([]),
    responseMessages: Promise.resolve([]),
    toolCalls: Promise.resolve([]),
  } as never);
  vi.mocked(generateText).mockResolvedValue({
    text: "ok",
    usage: USO,
    totalUsage: USO,
    response: { id: "resp-1", modelId: MODELO, messages: [] },
    steps: [],
    toolCalls: [],
    responseMessages: [],
  } as never);
}

async function rodar(provider: string) {
  dubles();
  const { pool: p, inserts } = pool(provider);
  const r = await runModelCall(
    p,
    { anthropicApiKey: "chave-ant-de-teste", openaiApiKey: "chave-openai-de-teste", cacheTtl: "1h" },
    { tenantId: ORG, purpose: "agent_preview", messages: [{ role: "user", content: "oi" }] },
    { registry },
  );
  expect(inserts, "a chamada não gravou llm_calls").toHaveLength(1);
  // Ordem dos params do insert de sucesso em `run-model-call.ts`.
  const [, , , , , prov, model, input, output, , , custo] = inserts[0]!;
  return { r, prov, model, input, output, custo };
}

describe("custo da assinatura no seam", () => {
  it("⭐ assinatura grava cost_cents = 0 e mantém os tokens", async () => {
    const { r, prov, model, input, output, custo } = await rodar("openai-assinatura");
    expect(prov).toBe("openai-assinatura");
    expect(model).toBe(MODELO);
    expect(input).toBe(42_000);
    expect(output).toBe(7_000);
    expect(custo).toBe(0);
    expect(r.costCents).toBe(0);
  });

  it("controle negativo: o mesmo modelo pela chave paga (`openai`) grava o preço da tabela", async () => {
    const { prov, custo } = await rodar("openai");
    expect(prov).toBe("openai");
    const esperado = costCents(MODELO, {
      inputTokens: 42_000,
      outputTokens: 7_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(esperado).toBeGreaterThan(0);
    expect(custo).toBeCloseTo(esperado!, 10);
  });

  it("o gasto do mês não sobe: a soma das linhas da assinatura é 0, a da chave paga não", async () => {
    // `fn_gasto_de_ia_do_mes` = sum(coalesce(cost_cents, 0)) das linhas do mês.
    const assinatura = await rodar("openai-assinatura");
    const paga = await rodar("openai");
    const gasto = (linhas: unknown[]) => linhas.reduce<number>((t, c) => t + Number(c ?? 0), 0);
    expect(gasto([assinatura.custo, assinatura.custo])).toBe(0);
    expect(gasto([paga.custo])).toBeGreaterThan(0);
  });
});

describe("a regra de provedor em pricing.ts", () => {
  it("o id do provedor de assinatura é o mesmo de `PROVEDOR_POR_ASSINATURA`", () => {
    expect(provedorSemCustoPorToken(PROVEDOR_POR_ASSINATURA)).toBe(true);
  });

  it("só a assinatura zera; chave paga, OpenRouter e provedor ausente passam o custo como veio", () => {
    expect(custoGravavel("openai-assinatura", 12.5)).toBe(0);
    expect(custoGravavel("openai-assinatura", null)).toBe(0);
    expect(custoGravavel("openai", 12.5)).toBe(12.5);
    expect(custoGravavel("openrouter", 3)).toBe(3);
    expect(custoGravavel(undefined, null)).toBeNull();
  });
});
