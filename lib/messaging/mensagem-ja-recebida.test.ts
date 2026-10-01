import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarIngestDeGrupoDb } from "@/lib/grupos/ingest";
import { DUPLICADA_PELA_LEITURA, mensagemJaRecebida } from "./mensagem-ja-recebida";

/**
 * O dedup antes do INSERT de `messages` existe para poupar o banco (a constraint
 * é deferida: o 23505 só subia no COMMIT, depois dos triggers). Ele NÃO pode
 * mudar o desfecho: o que era "duplicada" continua "duplicada", o que era nova
 * continua sendo gravada, e leitura com problema nunca engole mensagem.
 */

type Linha = { organization_id: string; external_id: string | null };

function adminDeMentira(opts: {
  existentes?: Linha[];
  leitura?: "ok" | "erro" | "lanca";
  insertDevolve?: { code: string; message: string } | null;
}) {
  const existentes = opts.existentes ?? [];
  const leituras: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const admin = {
    from(tabela: string) {
      expect(tabela).toBe("messages");
      const filtros: Record<string, unknown> = {};
      const q = {
        eq(c: string, v: unknown) {
          filtros[c] = v;
          return q;
        },
        limit() {
          return q;
        },
        async maybeSingle() {
          leituras.push({ ...filtros });
          if (opts.leitura === "lanca") throw new Error("rede caiu");
          if (opts.leitura === "erro") return { data: null, error: { message: "timeout" } };
          const achou = existentes.find(
            (m) =>
              m.organization_id === filtros.organization_id &&
              m.external_id === filtros.external_id,
          );
          return { data: achou ? { id: "m-1" } : null, error: null };
        },
      };
      return {
        select: () => q,
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return {
            select: () => ({
              async maybeSingle() {
                if (opts.insertDevolve) return { data: null, error: opts.insertDevolve };
                return { data: { id: "nova" }, error: null };
              },
            }),
          };
        },
      };
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  return { admin: admin as unknown as SupabaseClient, leituras, inserts };
}

describe("mensagemJaRecebida", () => {
  it("afirma quando a linha existe na MESMA organização, pelo índice (org, external_id)", async () => {
    const { admin, leituras } = adminDeMentira({
      existentes: [{ organization_id: "org-1", external_id: "wamid.A" }],
    });
    expect(await mensagemJaRecebida(admin, "org-1", "wamid.A")).toBe(true);
    expect(leituras).toEqual([{ organization_id: "org-1", external_id: "wamid.A" }]);
  });

  it("o mesmo external_id de OUTRA organização não conta", async () => {
    const { admin } = adminDeMentira({
      existentes: [{ organization_id: "org-2", external_id: "wamid.A" }],
    });
    expect(await mensagemJaRecebida(admin, "org-1", "wamid.A")).toBe(false);
  });

  it("sem external_id não consulta nada (não há o que deduplicar)", async () => {
    const { admin, leituras } = adminDeMentira({});
    expect(await mensagemJaRecebida(admin, "org-1", null)).toBe(false);
    expect(await mensagemJaRecebida(admin, "org-1", "")).toBe(false);
    expect(leituras).toHaveLength(0);
  });

  it("leitura com erro ou exceção é FAIL-OPEN: deixa o INSERT decidir", async () => {
    expect(await mensagemJaRecebida(adminDeMentira({ leitura: "erro" }).admin, "o", "x")).toBe(
      false,
    );
    expect(await mensagemJaRecebida(adminDeMentira({ leitura: "lanca" }).admin, "o", "x")).toBe(
      false,
    );
  });

  it("o desfecho sintético tem a forma do 23505 do PostgREST", () => {
    expect(DUPLICADA_PELA_LEITURA.data).toBeNull();
    expect(DUPLICADA_PELA_LEITURA.error.code).toBe("23505");
  });
});

describe("caminho de ingestão (grupo): dedup antes do INSERT", () => {
  const row = {
    organization_id: "org-1",
    external_id: "wamid.G",
    conversation_id: "c-1",
    media_url: null,
  };

  it("reentrega: devolve 'duplicada' SEM tocar no INSERT (nem nos triggers)", async () => {
    const { admin, inserts } = adminDeMentira({
      existentes: [{ organization_id: "org-1", external_id: "wamid.G" }],
    });
    expect(await criarIngestDeGrupoDb(admin).inserirMensagem(row)).toBe("duplicada");
    expect(inserts).toHaveLength(0);
  });

  it("mensagem nova: grava, como antes", async () => {
    const { admin, inserts } = adminDeMentira({});
    expect(await criarIngestDeGrupoDb(admin).inserirMensagem(row)).toBe("ok");
    expect(inserts).toHaveLength(1);
  });

  it("corrida (duas entregas passam pela leitura): a constraint segue sendo a rede", async () => {
    const { admin, inserts } = adminDeMentira({
      insertDevolve: { code: "23505", message: "duplicate key" },
    });
    expect(await criarIngestDeGrupoDb(admin).inserirMensagem(row)).toBe("duplicada");
    expect(inserts).toHaveLength(1);
  });

  it("leitura falhou: não perde a mensagem, insere", async () => {
    const { admin, inserts } = adminDeMentira({ leitura: "lanca" });
    expect(await criarIngestDeGrupoDb(admin).inserirMensagem(row)).toBe("ok");
    expect(inserts).toHaveLength(1);
  });
});
