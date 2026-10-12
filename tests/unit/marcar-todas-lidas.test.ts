/**
 * "Marcar todas como lidas" em lote (M2.1, regras do @Cassio_SecRev na #173):
 * - o servidor decide o conjunto, por organização e pelo usuário (sem ids do cliente);
 * - só o estado de leitura do PRÓPRIO atendente (contador das conversas dele e a
 *   marca pessoal dele);
 * - lote com limite, idempotente, auditado;
 * - nenhum "visto" no WhatsApp: a rota e o módulo não tocam canal nenhum.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LIMITE_DO_LOTE, marcarTodasComoLidas } from "@/lib/inbox/marcar-todas-lidas";

type Chamada = { tabela: string; op: string; filtros: [string, string, unknown][]; valor?: unknown };

/** Um cliente falso que REGISTRA cada consulta, com todos os filtros aplicados. */
function clienteFalso(linhas: { conversations: { id: string }[]; estado: { conversation_id: string }[] }) {
  const chamadas: Chamada[] = [];
  const from = (tabela: string) => {
    const atual: Chamada = { tabela, op: "", filtros: [] };
    const cadeia = {
      select: () => ((atual.op = "select"), cadeia),
      update: (valor: unknown) => ((atual.op = "update"), (atual.valor = valor), cadeia),
      eq: (c: string, v: unknown) => (atual.filtros.push(["eq", c, v]), cadeia),
      gt: (c: string, v: unknown) => (atual.filtros.push(["gt", c, v]), cadeia),
      not: (c: string, o: string, v: unknown) => (atual.filtros.push(["not", c, `${o}:${v}`]), cadeia),
      in: (c: string, v: unknown) => (atual.filtros.push(["in", c, v]), cadeia),
      limit: (n: number) => (atual.filtros.push(["limit", "", n]), cadeia),
      then: (ok: (r: unknown) => void) => {
        chamadas.push(atual);
        const data = atual.op === "select" ? (tabela === "conversations" ? linhas.conversations : linhas.estado) : null;
        ok({ data, error: null });
      },
    };
    return cadeia;
  };
  return { cliente: { from } as never, chamadas };
}

const ALVO = { orgId: "org-1", userId: "user-1" };
const tem = (c: Chamada, op: string, col: string, v?: unknown) =>
  c.filtros.some(([o, k, val]) => o === op && k === col && (v === undefined || JSON.stringify(val) === JSON.stringify(v)));

describe("marcar todas como lidas: o conjunto e o dono", () => {
  it("toda consulta é da organização ativa e do próprio usuário", async () => {
    const { cliente, chamadas } = clienteFalso({ conversations: [{ id: "c1" }], estado: [{ conversation_id: "c2" }] });
    await marcarTodasComoLidas(cliente, ALVO);
    expect(chamadas).toHaveLength(4);
    for (const c of chamadas) expect(tem(c, "eq", "organization_id", "org-1"), `${c.tabela} ${c.op}`).toBe(true);
    const conversas = chamadas.filter((c) => c.tabela === "conversations");
    // O contador é de quem ATENDE: só as conversas atribuídas a quem pediu.
    for (const c of conversas) expect(tem(c, "eq", "assigned_to_user_id", "user-1")).toBe(true);
    const estado = chamadas.filter((c) => c.tabela === "conversation_user_state");
    for (const c of estado) expect(tem(c, "eq", "user_id", "user-1")).toBe(true);
  });

  it("zera só o contador e limpa só a marca pessoal", async () => {
    const { cliente, chamadas } = clienteFalso({ conversations: [{ id: "c1" }], estado: [{ conversation_id: "c2" }] });
    const r = await marcarTodasComoLidas(cliente, ALVO);
    const updates = chamadas.filter((c) => c.op === "update");
    expect(updates[0]).toMatchObject({ tabela: "conversations", valor: { unread_count_for_assignee: 0 } });
    expect(tem(updates[0]!, "in", "id", ["c1"])).toBe(true);
    expect(updates[1]).toMatchObject({ tabela: "conversation_user_state" });
    expect(Object.keys(updates[1]!.valor as object).sort()).toEqual(["marked_unread_at", "updated_at"]);
    expect(r).toEqual({ contadores: 1, marcas: 1, restam: false });
  });

  it("idempotente: sem nada a marcar, não escreve nada", async () => {
    const { cliente, chamadas } = clienteFalso({ conversations: [], estado: [] });
    const r = await marcarTodasComoLidas(cliente, ALVO);
    expect(chamadas.filter((c) => c.op === "update")).toEqual([]);
    expect(r).toEqual({ contadores: 0, marcas: 0, restam: false });
  });

  it("lote com limite: acima dele, escreve o limite e avisa que restam", async () => {
    const muitas = Array.from({ length: LIMITE_DO_LOTE + 1 }, (_, i) => ({ id: `c${i}` }));
    const { cliente, chamadas } = clienteFalso({ conversations: muitas, estado: [] });
    const r = await marcarTodasComoLidas(cliente, ALVO);
    const ids = chamadas.find((c) => c.op === "update")!.filtros.find(([o]) => o === "in")![2] as string[];
    expect(ids).toHaveLength(LIMITE_DO_LOTE);
    expect(r.restam).toBe(true);
  });
});

describe("marcar todas como lidas: sem visto no WhatsApp", () => {
  it("nem o módulo nem a rota importam canal, adaptador ou cliente admin", () => {
    for (const arquivo of ["lib/inbox/marcar-todas-lidas.ts", "app/api/v1/conversations/mark-all-read/route.ts"]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, arquivo).not.toMatch(/from "@\/lib\/channels/);
      expect(fonte, arquivo).not.toMatch(/createAdminClient|supabase\/admin/);
    }
  });

  it("a ação individual também não envia visto (é ela que o lote espelha)", () => {
    const individual = readFileSync("app/api/v1/conversations/[id]/mark-read/route.ts", "utf8");
    expect(individual).not.toMatch(/from "@\/lib\/channels/);
  });
});
