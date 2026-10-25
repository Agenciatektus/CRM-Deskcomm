import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: async () => "cifra" }));

import { gravarConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura";

type Resposta = { data?: unknown[] | null; error?: { code?: string; message: string } | null };

const chamadas: { op: string; arg?: unknown; filtros: [string, unknown][] }[] = [];
let resposta: Resposta = {};

// Dublê que registra a operação e os filtros .eq() encadeados.
function dubleDoBanco(): SupabaseClient {
  const encadeia = (op: string, arg?: unknown) => {
    const chamada = { op, arg, filtros: [] as [string, unknown][] };
    chamadas.push(chamada);
    const q: Record<string, unknown> = {
      eq: (k: string, v: unknown) => {
        chamada.filtros.push([k, v]);
        return q;
      },
      select: () => q,
      then: (ok: (r: Resposta) => unknown) => ok({ data: [], error: null, ...resposta }),
    };
    return q;
  };
  return {
    from: () => ({
      update: (v: unknown) => encadeia("update", v),
      insert: (v: unknown) => encadeia("insert", v),
      upsert: (v: unknown) => encadeia("upsert", v),
    }),
  } as unknown as SupabaseClient;
}

const base = { organizationId: "org", userId: "u1", platform: "meta_ads" as const, defaultAccountId: "act_1" };

beforeEach(() => {
  chamadas.length = 0;
  resposta = {};
});

describe("gravarConexaoDeLeitura: escrita condicionada", () => {
  it("com lidoEm, o UPDATE filtra por organização, plataforma e updated_at lido", async () => {
    resposta = { data: [{ organization_id: "org" }] };
    const r = await gravarConexaoDeLeitura(dubleDoBanco(), { ...base, lidoEm: "2026-10-25T10:00:00Z" });
    expect(r).toEqual({ ok: true });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.op).toBe("update");
    expect(chamadas[0]!.filtros).toEqual([
      ["organization_id", "org"],
      ["platform", "meta_ads"],
      ["updated_at", "2026-10-25T10:00:00Z"],
    ]);
  });

  it("com lidoEm e zero linhas devolvidas, é superada", async () => {
    resposta = { data: [] };
    expect(await gravarConexaoDeLeitura(dubleDoBanco(), { ...base, lidoEm: "x" })).toEqual({ ok: false, error: "superada" });
  });

  it("com lidoEm e erro do banco, é erro_ao_gravar", async () => {
    resposta = { error: { message: "boom" } };
    expect(await gravarConexaoDeLeitura(dubleDoBanco(), { ...base, lidoEm: "x" })).toEqual({
      ok: false,
      error: "erro_ao_gravar",
      detalhe: "boom",
    });
  });

  it("sem lidoEm nem primeira segue o caminho antigo (upsert)", async () => {
    expect(await gravarConexaoDeLeitura(dubleDoBanco(), base)).toEqual({ ok: true });
    expect(chamadas.map((c) => c.op)).toEqual(["upsert"]);
  });

  it("primeira conexão usa INSERT, nunca upsert", async () => {
    expect(await gravarConexaoDeLeitura(dubleDoBanco(), { ...base, primeira: true, accessToken: "t" })).toEqual({ ok: true });
    expect(chamadas.map((c) => c.op)).toEqual(["insert"]);
  });

  it("primeira conexão concorrente (23505) é superada", async () => {
    resposta = { error: { code: "23505", message: "duplicate key" } };
    expect(await gravarConexaoDeLeitura(dubleDoBanco(), { ...base, primeira: true })).toEqual({ ok: false, error: "superada" });
  });

  it("primeira conexão com outro erro é erro_ao_gravar", async () => {
    resposta = { error: { code: "42501", message: "negado" } };
    expect(await gravarConexaoDeLeitura(dubleDoBanco(), { ...base, primeira: true })).toEqual({
      ok: false,
      error: "erro_ao_gravar",
      detalhe: "negado",
    });
  });
});
