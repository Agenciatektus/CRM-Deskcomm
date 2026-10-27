import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ bloqueada: false, semChave: false }));

vi.mock("@/lib/ai/runtime/agent", () => ({
  chaveDaInstalacaoParaOrg: async () =>
    state.semChave
      ? { apiKey: null, bloqueada: false }
      : state.bloqueada
        ? { apiKey: null, bloqueada: true }
        : { apiKey: "sk-inst", bloqueada: false },
}));

import { publishAgentVersion } from "./publish";

function admin(rpc = vi.fn(async () => ({ data: [{}], error: null }))) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) c[m] = () => c;
  c.maybeSingle = async () => ({
    data: { provider: "openai", credential_id: null, handoff_legal_enabled: false },
    error: null,
  });
  return { from: () => c, rpc } as never;
}
const params = { orgId: "org-1", agentId: "a", versionId: "v" };

beforeEach(() => {
  state.bloqueada = false;
  state.semChave = false;
});

describe("publishAgentVersion com chave da instalação", () => {
  it("org com IA própria sem credencial: recusa e nem chama o RPC", async () => {
    state.bloqueada = true;
    const rpc = vi.fn();
    const r = await publishAgentVersion(admin(rpc as never), params);
    expect(r).toMatchObject({ ok: false, code: "credential_missing" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem chave no env: recusa como hoje", async () => {
    state.semChave = true;
    expect(await publishAgentVersion(admin(), params)).toMatchObject({ ok: false, code: "credential_missing" });
  });

  it("CONTROLE NEGATIVO: sem plano, com chave da instalação, o RPC é chamado", async () => {
    const rpc = vi.fn(async () => ({ data: [{}], error: null }));
    await publishAgentVersion(admin(rpc as never), params);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
