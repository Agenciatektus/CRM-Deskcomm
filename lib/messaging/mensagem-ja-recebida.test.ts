/**
 * Dedup ANTES do INSERT de `messages` (substitui parte da #59).
 *
 * `messages_org_external_id_unique` é DEFERRABLE INITIALLY DEFERRED: a
 * reentrega roda os gatilhos de `messages` inteiros (inclusive o que emite o
 * `message.received` que acorda a IA) e só estoura o 23505 no COMMIT. A leitura
 * pela chave da constraint, por organização, faz a reentrega sair antes. O
 * 23505 continua sendo a rede da corrida. A prova contra Postgres de verdade
 * (gatilho que não roda, constraint que segura a corrida) está em
 * tests/invariants/dedupe-de-mensagens-antes-do-insert.test.ts, e a ligação em
 * cada canal, em tests/unit/dedupe-de-mensagens-antes-do-insert.test.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { mensagemJaRecebida } from "./mensagem-ja-recebida";

type Leitura = { data: unknown; error: unknown } | "lanca";

/**
 * Admin falso de `messages`: a leitura devolve o que o caso manda; o INSERT é
 * registrado e devolve sucesso ou o 23505 que o COMMIT daria.
 */
function adminDeMensagens(leitura: Leitura, insertDa23505 = false) {
  const filtros: Array<[string, unknown]> = [];
  const inserts: Record<string, unknown>[] = [];
  const from = (tabela: string) => {
    if (tabela === "channel_sessions") {
      const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        is: () => c,
        maybeSingle: async () => ({ data: { id: "sessao-1", organization_id: "org-1" }, error: null }),
      };
      return c;
    }
    if (tabela !== "messages") throw new Error(`tabela inesperada: ${tabela}`);
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return q;
      },
      limit: () => q,
      maybeSingle: async () => {
        if (leitura === "lanca") throw new Error("rede caiu");
        return leitura;
      },
      insert: (linha: Record<string, unknown>) => {
        inserts.push(linha);
        return {
          select: () => ({
            maybeSingle: async () =>
              insertDa23505
                ? { data: null, error: { code: "23505", message: "duplicate key value" } }
                : { data: { id: "msg-nova" }, error: null },
          }),
        };
      },
    };
    return q;
  };
  const rpc = async (nome: string) => {
    if (nome === "fn_upsert_wa_contact") return { data: "contato-1", error: null };
    if (nome === "fn_upsert_wa_conversation") return { data: "conversa-1", error: null };
    return { data: null, error: null };
  };
  return { filtros, inserts, admin: { from, rpc } as unknown as SupabaseClient };
}

const NAO_EXISTE: Leitura = { data: null, error: null };
const EXISTE: Leitura = { data: { id: "msg-antiga" }, error: null };
const FALHOU: Leitura = { data: null, error: { code: "57014", message: "statement timeout" } };

describe("mensagemJaRecebida", () => {
  it("lê pela chave da constraint, por organização, e afirma quando a linha existe", async () => {
    const { admin, filtros } = adminDeMensagens(EXISTE);
    expect(await mensagemJaRecebida(admin, "org-1", "wamid.X")).toBe(true);
    expect(filtros).toEqual([
      ["organization_id", "org-1"],
      ["external_id", "wamid.X"],
    ]);
  });

  it("CONTROLE: linha ausente devolve false", async () => {
    const { admin } = adminDeMensagens(NAO_EXISTE);
    expect(await mensagemJaRecebida(admin, "org-1", "wamid.X")).toBe(false);
  });

  it("sem external_id não consulta (a constraint não compara nulo)", async () => {
    const { admin, filtros } = adminDeMensagens(EXISTE);
    expect(await mensagemJaRecebida(admin, "org-1", null)).toBe(false);
    expect(await mensagemJaRecebida(admin, "org-1", "")).toBe(false);
    expect(filtros).toEqual([]);
  });

  it("fail-open: erro ou exceção na leitura devolve false (o INSERT decide)", async () => {
    expect(await mensagemJaRecebida(adminDeMensagens(FALHOU).admin, "org-1", "wamid.X")).toBe(false);
    expect(await mensagemJaRecebida(adminDeMensagens("lanca").admin, "org-1", "wamid.X")).toBe(false);
  });
});
