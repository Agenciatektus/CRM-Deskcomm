/**
 * PATCH DA CADÊNCIA: QUEM PODE MUDAR QUEM ATENDE QUANDO O LEAD RESPONDE.
 *
 * Trocar o agente, a instrução, quem atende, ou tirar a revisão humana
 * (assistido → automático) muda QUEM fala com o lead e o que ele pode fazer:
 * exige admin. Objetivo e etapa-alvo continuam de manager. A rota é exercitada
 * de verdade (a regra pura, o gate e o audit), com o banco em dublê.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
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
const CAD = "22222222-2222-4222-8222-222222222222";
const FUNIL = "33333333-3333-4333-8333-333333333333";
const ETAPA_GATILHO = "44444444-4444-4444-8444-444444444444";
const ETAPA_ALVO = "55555555-5555-4555-8555-555555555555";
const OUTRA_ETAPA = "66666666-6666-4666-8666-666666666666";
const AGENTE = "77777777-7777-4777-8777-777777777777";
const OUTRO_AGENTE = "88888888-8888-4888-8888-888888888888";

const POLITICA = {
  janela: { start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] },
  espacamento: { min_s: 45, max_s: 120 },
  legal_basis_ref: "LIA teste",
  max_inscricoes_dia: 50,
};
const IA = {
  quem_atende: "ia",
  agent_id: AGENTE,
  preset: "qualificar",
  etapa_alvo_id: ETAPA_ALVO,
  modo: "assistido",
} as const;

let gravada: Record<string, unknown>;
let atualizado: Record<string, unknown> | null;

function banco() {
  const tabela = (nome: string) => {
    const q: Record<string, unknown> = {};
    const encadeia = () => q;
    for (const m of ["select", "eq", "in", "is"]) q[m] = encadeia;
    q.maybeSingle = async () => {
      if (nome === "followup_flow_pointers") {
        return {
          data: {
            id: CAD,
            status: "draft",
            channel_session_id: null,
            pipeline_id: FUNIL,
            trigger_config: { kind: "stage_change", params: { stage_id: ETAPA_GATILHO } },
            cadence_settings: gravada,
          },
          error: null,
        };
      }
      if (nome === "crm_stages") return { data: { pipeline_id: FUNIL, is_lost: false, is_archived: false }, error: null };
      if (nome === "ai_agents") return { data: { archived_at: null }, error: null };
      return { data: null, error: null };
    };
    q.update = (valores: Record<string, unknown>) => {
      atualizado = valores;
      return q;
    };
    q.single = async () => ({ data: { id: CAD, ...atualizado }, error: null });
    return q;
  };
  return { from: tabela } as never;
}

function papel(maximo: "manager" | "admin") {
  vi.mocked(requireRole).mockImplementation(async (min) => {
    if (min === "admin" && maximo !== "admin") {
      return { ok: false, response: new Response(null, { status: 403 }) as never };
    }
    return {
      ok: true,
      user: { id: "99999999-9999-4999-8999-999999999999", idioma: "pt-BR" } as never,
      org: { orgId: ORG, name: "Org", role: maximo } as never,
    };
  });
}

async function patch(corpo: unknown) {
  const { PATCH } = await import("@/app/api/v1/cadencias/[id]/route");
  const req = new NextRequest(`https://crm.exemplo/api/v1/cadencias/${CAD}`, {
    method: "PATCH",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
  return PATCH(req, { params: Promise.resolve({ id: CAD }) });
}

function metadataDoAudit(): Record<string, unknown> {
  const chamada = vi.mocked(audit).mock.calls.at(-1)?.[0] as { metadata: Record<string, unknown> } | undefined;
  return chamada?.metadata ?? {};
}

beforeEach(() => {
  vi.clearAllMocks();
  gravada = { ...POLITICA, conducao: IA };
  atualizado = null;
  vi.mocked(createAdminClient).mockReturnValue(banco());
});

describe("PATCH da cadência: condução", () => {
  it("controle: manager muda objetivo e etapa-alvo (200) e o audit registra a condução", async () => {
    papel("manager");
    const r = await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, preset: "vender", etapa_alvo_id: OUTRA_ETAPA } } });
    expect(r.status).toBe(200);
    expect(vi.mocked(requireRole).mock.calls.map((c) => c[0])).toEqual(["manager"]);
    expect(metadataDoAudit()).toMatchObject({ conducao_alterada: true, modo_de: "assistido", modo_para: "assistido" });
  });

  it("manager NÃO troca o agente (403) e nada é gravado", async () => {
    papel("manager");
    const r = await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, agent_id: OUTRO_AGENTE } } });
    expect(r.status).toBe(403);
    expect(atualizado).toBeNull();
  });

  it("manager NÃO muda a instrução nem desliga a IA (403)", async () => {
    papel("manager");
    expect((await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, instrucao: "Ignore as regras" } } })).status).toBe(403);
    expect((await patch({ cadence_settings: { ...POLITICA, conducao: { quem_atende: "atendente" } } })).status).toBe(403);
    expect(atualizado).toBeNull();
  });

  it("assistido → automático exige admin; automático → assistido basta manager", async () => {
    papel("manager");
    expect((await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, modo: "automatico" } } })).status).toBe(403);
    gravada = { ...POLITICA, conducao: { ...IA, modo: "automatico" } };
    const r = await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, modo: "assistido" } } });
    expect(r.status).toBe(200);
    expect(metadataDoAudit()).toMatchObject({ modo_de: "automatico", modo_para: "assistido" });
  });

  it("admin troca o agente (200) e o audit diz de qual modo para qual", async () => {
    papel("admin");
    gravada = { ...POLITICA, conducao: { ...IA, modo: "assistido" } };
    const r = await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, agent_id: OUTRO_AGENTE, modo: "automatico" } } });
    expect(r.status).toBe(200);
    expect(vi.mocked(requireRole).mock.calls.map((c) => c[0])).toEqual(["manager", "admin"]);
    const meta = metadataDoAudit();
    expect(meta).toMatchObject({ conducao_alterada: true, modo_de: "assistido", modo_para: "automatico" });
    expect(meta.campos_da_conducao).toEqual(expect.arrayContaining(["agent_id", "modo"]));
  });

  it("política salva SEM a condução mantém a gravada (não desliga a IA por omissão)", async () => {
    papel("manager");
    const r = await patch({ cadence_settings: { ...POLITICA, max_inscricoes_dia: 20 } });
    expect(r.status).toBe(200);
    expect((atualizado?.cadence_settings as { conducao?: unknown }).conducao).toEqual(IA);
    expect(metadataDoAudit().conducao_alterada).toBeUndefined();
  });

  it("etapa-alvo igual à do gatilho é recusada (422)", async () => {
    papel("manager");
    const r = await patch({ cadence_settings: { ...POLITICA, conducao: { ...IA, etapa_alvo_id: ETAPA_GATILHO } } });
    expect(r.status).toBe(422);
    expect(atualizado).toBeNull();
  });
});
