/**
 * PATCH do audience_filter é PARCIAL (#404) e lê o salvo sem 422 (#405).
 * Banco em dublê; zero PII.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireSupportWrite: vi.fn(async () => null),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const CAMP = "22222222-2222-4222-8222-222222222222";
const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

let salvoNoBanco: Record<string, unknown>;
let statusNoBanco: string;
let atualizado: Record<string, unknown> | null;

function linha(): Record<string, unknown> {
  return {
    id: CAMP, organization_id: ORG, name: "Campanha", status: statusNoBanco,
    channel_session_id: U(9), message_body: "Oi", message_variants: [],
    base_legal: "consent", lia_ref: null, pipeline_id: null, passos: [], saidas: null,
    followup_pointer_id: null, entrada_continua: false, entrada_etapa_id: null,
    audience_filter: salvoNoBanco, audience_version: 1, content_version: 1,
    scheduled_at: null, intervalo_segundos: null, janela_inicio_hora: null,
    janela_fim_hora: null, teto_diario: null, teto_horario: null, description: null,
  };
}

function banco() {
  const from = (tabela: string) => {
    const q: Record<string, unknown> = {};
    let valores: Record<string, unknown> | null = null;
    for (const m of ["select", "eq", "in", "is", "not", "order", "limit"]) q[m] = () => q;
    q.update = (v: Record<string, unknown>) => {
      valores = v;
      if (tabela === "campaigns") atualizado = v;
      return q;
    };
    const resposta = () =>
      tabela === "campaigns"
        ? { data: { ...linha(), ...valores }, error: null }
        : { data: null, error: null };
    q.maybeSingle = async () => resposta();
    return q;
  };
  return { from } as never;
}

async function patch(corpo: unknown) {
  const { PATCH } = await import("@/app/api/v1/campaigns/[id]/route");
  return PATCH(
    new NextRequest(`https://crm.exemplo/api/v1/campaigns/${CAMP}`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: CAMP }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  atualizado = null;
  statusNoBanco = "draft";
  salvoNoBanco = { com_alguma_tag: ["vip"], limite: 100, funis: [U(1)], incluir_contatos: [U(3)] };
  vi.mocked(createAdminClient).mockReturnValue(banco());
  vi.mocked(requireRole).mockImplementation(async () => ({
    ok: true,
    user: { id: U(6), idioma: "pt-BR" } as never,
    org: { orgId: ORG, name: "Org", role: "manager" } as never,
  }));
});

describe("PATCH audience_filter parcial", () => {
  it("chave ausente é preservada: não apaga incluir_contatos/funis gravados depois", async () => {
    const r = await patch({ audience_filter: { sem_tags: ["frio"] } });
    expect(r.status).toBe(200);
    expect(atualizado?.audience_filter).toMatchObject({
      com_alguma_tag: ["vip"],
      sem_tags: ["frio"],
      funis: [U(1)],
      incluir_contatos: [U(3)],
    });
  });

  it("`[]` explícito limpa a chave", async () => {
    const r = await patch({ audience_filter: { incluir_contatos: [], com_alguma_tag: ["vip"] } });
    expect(r.status).toBe(200);
    expect(atualizado?.audience_filter).toMatchObject({ incluir_contatos: [], funis: [U(1)] });
  });

  it("o resultado mesclado sem critério nenhum é 422 e não grava", async () => {
    salvoNoBanco = { limite: 100, incluir_contatos: [U(3)] };
    const r = await patch({ audience_filter: { incluir_contatos: [] } });
    expect(r.status).toBe(422);
    expect(atualizado).toBeNull();
  });

  it("filtro salvo com chave removida salva sem 422 e a descarta", async () => {
    salvoNoBanco = { ...salvoNoBanco, chave_removida: true };
    const r = await patch({ audience_filter: { limite: 50 } });
    expect(r.status).toBe(200);
    expect(atualizado?.audience_filter).not.toHaveProperty("chave_removida");
    expect(atualizado?.audience_filter).toMatchObject({ limite: 50, incluir_contatos: [U(3)] });
  });

  it("chave desconhecida ENVIADA continua 422", async () => {
    const r = await patch({ audience_filter: { inventada: 1 } });
    expect(r.status).toBe(422);
  });

  it("fora do rascunho segue 409", async () => {
    statusNoBanco = "running";
    const r = await patch({ audience_filter: { limite: 50 } });
    expect(r.status).toBe(409);
    expect(atualizado).toBeNull();
  });
});
