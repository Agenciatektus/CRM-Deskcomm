import { describe, expect, it, vi } from "vitest";

import { acompanharDonoNaConversa } from "./acompanhar-dono-na-conversa";

const ORG = "o1";
const NOVO = "u-novo";

function cliente(conversas: Array<{ id: string; assigned_to_user_id: string | null }>, rpcErro?: string) {
  const filtros: string[] = [];
  const rpc = vi.fn(async () => ({ data: rpcErro ? null : [{}], error: rpcErro ? { message: rpcErro } : null }));
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "in", "or"]) {
    q[m] = (...a: unknown[]) => {
      filtros.push(`${m}:${a.join(",")}`);
      return q;
    };
  }
  q.then = (r: (v: unknown) => unknown) => r({ data: conversas, error: null });
  const c = { from: vi.fn(() => ({ select: () => q })), rpc };
  return { c: c as never, rpc, filtros };
}

describe("acompanharDonoNaConversa", () => {
  it("move a conversa de outro atendente", async () => {
    const { c, rpc, filtros } = cliente([{ id: "c1", assigned_to_user_id: "u-velho" }]);
    expect(await acompanharDonoNaConversa(c, { organizationId: ORG, contactIds: ["k1"], novoDonoUserId: NOVO })).toBe(1);
    expect(rpc).toHaveBeenCalledWith("fn_conversation_assign", expect.objectContaining({
      p_conversation_id: "c1", p_to_user_id: NOVO, p_reason: "transfer", p_expected_assignee: "u-velho", p_enforce_expected: true,
    }));
    // conversa fechada e conversa com IA ficam de fora na consulta
    expect(filtros).toContain("in:status,open,claimed");
    expect(filtros).toContain("or:assignee_kind.is.null,assignee_kind.eq.user");
  });

  it("atribui a conversa sem responsável", async () => {
    const { c, rpc } = cliente([{ id: "c1", assigned_to_user_id: null }]);
    await acompanharDonoNaConversa(c, { organizationId: ORG, contactIds: ["k1"], novoDonoUserId: NOVO });
    expect(rpc).toHaveBeenCalledWith("fn_conversation_assign", expect.objectContaining({ p_expected_assignee: undefined }));
  });

  it("dono null (removido ou agente de IA) não consulta nem move", async () => {
    const { c, rpc } = cliente([{ id: "c1", assigned_to_user_id: "u-velho" }]);
    await acompanharDonoNaConversa(c, { organizationId: ORG, contactIds: ["k1"], novoDonoUserId: null });
    expect((c as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("já é do mesmo dono: zero chamadas", async () => {
    const { c, rpc } = cliente([{ id: "c1", assigned_to_user_id: NOVO }]);
    expect(await acompanharDonoNaConversa(c, { organizationId: ORG, contactIds: ["k1"], novoDonoUserId: NOVO })).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falha da RPC não lança", async () => {
    const { c } = cliente([{ id: "c1", assigned_to_user_id: "u-velho" }], "boom");
    await expect(
      acompanharDonoNaConversa(c, { organizationId: ORG, contactIds: ["k1"], novoDonoUserId: NOVO }),
    ).resolves.toBe(0);
  });
});
