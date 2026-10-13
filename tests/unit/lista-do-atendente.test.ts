import { describe, expect, it } from "vitest";

import { listConversationsHandler } from "@/app/api/v1/conversations/_handler";
import { listarParaOAtendente } from "@/app/api/v1/conversations/_lista-do-atendente";

/**
 * A lista da Inbox com o estado DE QUEM PEDE (migration 9042): fixadas no topo
 * da aba, "Não lidas" contando a marca pessoal, e um número FIXO de consultas
 * por requisição (nunca uma por conversa).
 */

interface Chamada {
  tabela: string;
  metodo: string;
  args: unknown[];
  consulta: number;
}

/**
 * Dublê que registra a cadeia por tabela e devolve, por consulta, o que
 * `respostas[tabela]` mandar (na ordem em que as consultas são abertas).
 */
function fakeSupabase(respostas: Record<string, Array<unknown[]>>) {
  const chamadas: Chamada[] = [];
  let n = 0;
  const usadas: Record<string, number> = {};
  const client = {
    from: (tabela: string) => {
      const consulta = ++n;
      const i = (usadas[tabela] = (usadas[tabela] ?? 0) + 1) - 1;
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (ok: (v: unknown) => unknown) => ok({ data: respostas[tabela]?.[i] ?? [], error: null });
            }
            return (...args: unknown[]) => {
              chamadas.push({ tabela, metodo: String(prop), args, consulta });
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { client: client as never, chamadas, consultas: () => n };
}

const ctx = { organization_id: "org-1", requestId: "req-1", actor: { type: "user" as const, id: "eu" } } as never;
const conversa = (id: string) => ({ id, assigned_to_user_id: null, unread_count_for_assignee: 0 });

describe("o handler aplica o recorte da borda", () => {
  it("`excetoIds` vira `not id in (...)`, `somenteIds` vira `in id`", async () => {
    const { client, chamadas } = fakeSupabase({});
    await listConversationsHandler(client, ctx, { limit: 50 } as never, { excetoIds: ["a", "b"] });
    await listConversationsHandler(client, ctx, { limit: 2 } as never, { somenteIds: ["a", "b"] });
    expect(chamadas.find((c) => c.metodo === "not")?.args).toEqual(["id", "in", "(a,b)"]);
    expect(chamadas.find((c) => c.metodo === "in")?.args).toEqual(["id", ["a", "b"]]);
  });

  it("com 'Não lidas', as marcadas pela pessoa entram por OU com o contador", async () => {
    const { client, chamadas } = fakeSupabase({});
    await listConversationsHandler(client, ctx, { limit: 50, unread: true } as never, { naoLidasExtras: ["m1"] });
    const ors = chamadas.filter((c) => c.metodo === "or").map((c) => c.args[0]);
    expect(ors).toContain("unread_count_for_assignee.gt.0,id.in.(m1)");
  });

  it("CONTROLE: sem recorte, a lista é a de sempre (as tools MCP não passam nada)", async () => {
    const { client, chamadas } = fakeSupabase({});
    await listConversationsHandler(client, ctx, { limit: 50, unread: true } as never);
    expect(chamadas.some((c) => c.metodo === "not" || c.metodo === "in")).toBe(false);
    expect(chamadas.filter((c) => c.metodo === "gt").map((c) => c.args.join(":"))).toContain("unread_count_for_assignee:0");
  });
});

describe("listarParaOAtendente", () => {
  const recorte = [
    { conversation_id: "f-velha", pinned_at: "2026-10-01T00:00:00Z", muted_until: null, marked_unread_at: null },
    { conversation_id: "f-nova", pinned_at: "2026-10-05T00:00:00Z", muted_until: "infinity", marked_unread_at: null },
    { conversation_id: "x", pinned_at: null, muted_until: null, marked_unread_at: "2026-10-06T00:00:00Z" },
  ];

  it("primeira página: fixadas no topo (a mais recente primeiro), fora da página, com o estado de cada uma", async () => {
    const { client, chamadas, consultas } = fakeSupabase({
      conversation_user_state: [recorte],
      // 1ª consulta de conversas = a página (sem as fixadas); 2ª = as fixadas
      conversations: [[conversa("x"), conversa("y")], [conversa("f-velha"), conversa("f-nova")]],
    });
    const r = await listarParaOAtendente(client, ctx, { limit: 50 } as never, "eu");

    expect(r.conversations.map((c) => c.id)).toEqual(["f-nova", "f-velha", "x", "y"]);
    expect(r.conversations[0]).toMatchObject({ pinned: true, muted_until: "infinity", marked_unread: false });
    expect(r.conversations[2]).toMatchObject({ pinned: false, marked_unread: true });
    expect(r.conversations[3]).toMatchObject({ pinned: false, muted_until: null, marked_unread: false });

    // Sem N+1: recorte + página + fixadas, qualquer que seja o tamanho da página.
    expect(consultas()).toBe(3);
    // O recorte é DESTA pessoa, nesta organização.
    const doEstado = chamadas.filter((c) => c.tabela === "conversation_user_state" && c.metodo === "eq");
    expect(doEstado.map((c) => c.args.join(":"))).toEqual(expect.arrayContaining(["user_id:eu", "organization_id:org-1"]));
    // A página exclui as fixadas; a consulta das fixadas usa os mesmos filtros da aba.
    expect(chamadas.find((c) => c.metodo === "not")?.args).toEqual(["id", "in", "(f-nova,f-velha)"]);
  });

  it("página seguinte (com cursor): não repete as fixadas, mas continua excluindo-as", async () => {
    const cursor = Buffer.from(JSON.stringify({ sort: "2026-10-01T00:00:00Z", id: "y" })).toString("base64url");
    const { client, chamadas, consultas } = fakeSupabase({
      conversation_user_state: [recorte],
      conversations: [[conversa("z")]],
    });
    const r = await listarParaOAtendente(client, ctx, { limit: 50, cursor } as never, "eu");
    expect(r.conversations.map((c) => c.id)).toEqual(["z"]);
    expect(consultas()).toBe(2);
    expect(chamadas.some((c) => c.metodo === "not")).toBe(true);
  });

  it("sem estado nenhum: a lista sai como antes, com os campos em falso", async () => {
    const { client, consultas } = fakeSupabase({ conversation_user_state: [[]], conversations: [[conversa("a")]] });
    const r = await listarParaOAtendente(client, ctx, { limit: 50 } as never, "eu");
    expect(r.conversations).toEqual([expect.objectContaining({ id: "a", pinned: false, muted_until: null, marked_unread: false })]);
    expect(consultas()).toBe(2);
  });
});
