import { describe, expect, it, vi } from "vitest";

import { acompanharDonoNaConversa } from "./acompanhar-dono-na-conversa";

const ORG = "o1";
const NOVO = "u-novo";

type Conv = {
  id: string;
  contact_id: string;
  status: string;
  assignee_kind: string | null;
  assigned_to_user_id: string | null;
};

/** Dublê que EXECUTA eq/in sobre as linhas: mudar o filtro do helper muda o resultado. */
function cliente(conversas: Conv[], rpcErro?: string) {
  const rpc = vi.fn(async () => ({ data: rpcErro ? null : [{}], error: rpcErro ? { message: rpcErro } : null }));
  const consultas = vi.fn();
  const from = vi.fn(() => ({
    select: () => {
      consultas();
      let rows: Array<Record<string, unknown>> = conversas.map((c) => ({ organization_id: ORG, ...c }));
      const q: Record<string, unknown> = {
        eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), q),
        in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), q),
        then: (r: (v: unknown) => unknown) => r({ data: rows, error: null }),
      };
      return q;
    },
  }));
  return { c: { from, rpc } as never, rpc, from, consultas };
}

const base = { contact_id: "k1", status: "claimed", assignee_kind: "user", assigned_to_user_id: "u-velho" };
const rodar = (c: never, over: Partial<{ contactIds: string[]; novoDonoUserId: string | null }> = {}) =>
  acompanharDonoNaConversa(c, { organizationId: ORG, contactIds: ["k1"], novoDonoUserId: NOVO, ...over });

describe("acompanharDonoNaConversa", () => {
  it("move a conversa reivindicada de outro atendente", async () => {
    const { c, rpc } = cliente([{ id: "c1", ...base }]);
    expect(await rodar(c)).toBe(1);
    expect(rpc).toHaveBeenCalledWith("fn_conversation_assign", expect.objectContaining({
      p_conversation_id: "c1", p_to_user_id: NOVO, p_reason: "transfer", p_expected_assignee: "u-velho", p_enforce_expected: true,
    }));
  });

  it("NÃO move conversa aberta sem responsável (a IA atende; a RPC silenciaria o bot)", async () => {
    const { c, rpc } = cliente([{ id: "c1", ...base, status: "open", assignee_kind: null, assigned_to_user_id: null }]);
    expect(await rodar(c)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("NÃO move conversa com IA, nem fechada, nem de outro contato", async () => {
    const { c, rpc } = cliente([
      { id: "c1", ...base, assignee_kind: "ai" },
      { id: "c2", ...base, status: "closed" },
      { id: "c3", ...base, contact_id: "outro" },
    ]);
    expect(await rodar(c)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dono null (removido ou agente de IA) não consulta nem move", async () => {
    const { c, rpc, from } = cliente([{ id: "c1", ...base }]);
    await rodar(c, { novoDonoUserId: null });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("já é do mesmo dono: zero chamadas", async () => {
    const { c, rpc } = cliente([{ id: "c1", ...base, assigned_to_user_id: NOVO }]);
    expect(await rodar(c)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lote com 2 leads do mesmo contato: 1 consulta e 1 chamada por conversa", async () => {
    const { c, rpc, consultas } = cliente([{ id: "c1", ...base }]);
    await rodar(c, { contactIds: ["k1", "k1"] });
    expect(consultas).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("falha da RPC não lança", async () => {
    const { c } = cliente([{ id: "c1", ...base }], "boom");
    await expect(rodar(c)).resolves.toBe(0);
  });
});
