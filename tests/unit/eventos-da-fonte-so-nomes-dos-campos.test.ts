import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A ROTA DE EVENTOS DA FONTE DEVOLVE OS NOMES DOS CAMPOS, NUNCA OS VALORES (9035).
 *
 * Com a 9035 nenhuma sessão lê `payload_parsed` da tabela (grant por coluna), e
 * a rota passou a ler pelo service role. Service role não passa por grant nem
 * por RLS: o filtro por organização é o isolamento, e é ele que este arquivo
 * vigia, junto com "o valor não sai".
 */

const ORG = "org-ativa";
const filtros: Array<[string, unknown]> = [];
let fonte: { path_token: string } | null = { path_token: "tok-fonte" };

const linhas = [
  {
    id: "e1",
    received_at: "2026-10-05T12:00:00Z",
    valid_signature: true,
    status: "received",
    payload_parsed: { nome: "Joana da Silva", telefone: "+5511999998888" },
  },
];

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { idioma: "pt-BR" }, org: { orgId: ORG } }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const cadeia = { select: () => cadeia, eq: () => cadeia, maybeSingle: async () => ({ data: fonte, error: null }) };
    return { from: () => cadeia };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const cadeia = {
      select: () => cadeia,
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return cadeia;
      },
      order: () => cadeia,
      limit: async () => ({ data: linhas, error: null }),
    };
    return { from: () => cadeia };
  },
}));

async function chamar() {
  const { GET } = await import("@/app/api/v1/webhook-sources/[id]/events/route");
  const r = await GET(new Request("https://crm.exemplo/api/v1/webhook-sources/s1/events"), {
    params: Promise.resolve({ id: "s1" }),
  });
  return { status: r.status, corpo: (await r.json()) as { data: Array<Record<string, unknown>> } };
}

describe("GET /api/v1/webhook-sources/[id]/events", () => {
  beforeEach(() => {
    filtros.length = 0;
    fonte = { path_token: "tok-fonte" };
  });

  it("devolve os nomes dos campos e nenhum valor", async () => {
    const { status, corpo } = await chamar();
    expect(status).toBe(200);
    expect(corpo.data[0]).toEqual({
      id: "e1",
      created_at: "2026-10-05T12:00:00Z",
      valid_signature: true,
      status: "received",
      campos_recebidos: ["nome", "telefone"],
    });
    const texto = JSON.stringify(corpo);
    expect(texto).not.toContain("Joana");
    expect(texto).not.toContain("+5511999998888");
    expect(texto).not.toContain("payload_parsed");
  });

  it("o service role filtra pela organização ativa E pelo token da fonte", async () => {
    await chamar();
    expect(filtros).toContainEqual(["organization_id", ORG]);
    expect(filtros).toContainEqual(["webhook_path_token", "tok-fonte"]);
  });

  it("fonte de outra organização: 404 antes de qualquer leitura do arquivo", async () => {
    fonte = null;
    const { status } = await chamar();
    expect(status).toBe(404);
    expect(filtros).toEqual([]);
  });
});
