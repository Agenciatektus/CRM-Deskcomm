/**
 * Apagar a última chave PRÓPRIA do Jev, com a plataforma servindo a empresa, volta
 * para o Jev da plataforma e NÃO desliga. Cada caso tem o controle negativo ao lado:
 * sem a plataforma servindo (chave da instalação vazia, empresa isenta, plano sem IA,
 * IA própria, origem OpenRouter), o Jev desliga como sempre.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/v1/ai/credentials/[id]/route";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USUARIO = "33333333-3333-4333-8333-333333333333";
const ID = "22222222-2222-4222-8222-222222222222";
const ACEITE = { em: "2026-09-01T12:00:00.000Z", por: USUARIO };
const ELEGIVEL = { estado: "ativa", plano: { inclui_ia: true, ia_propria: false } };

type Linha = Record<string, unknown>;

interface Estado {
  provider: string;
  settings: Linha;
  assinatura: Linha | null;
  escritasEmOrg: number;
}

let estado: Estado;

function fakeAdmin() {
  return {
    from(tabela: string) {
      let op: "select" | "update" | "delete" = "select";
      let patch: Linha | null = null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: (p: Linha) => {
          op = "update";
          patch = p;
          return chain;
        },
        delete: () => {
          op = "delete";
          return chain;
        },
        maybeSingle: async () => {
          if (tabela === "ai_provider_credentials") {
            return {
              data: { id: ID, organization_id: ORG, provider: estado.provider, label: "Jev", api_key_last4: "wxyz" },
              error: null,
            };
          }
          if (tabela === "cobranca_assinaturas") return { data: estado.assinatura, error: null };
          expect(tabela).toBe("organizations");
          if (op === "update" && patch) {
            estado.settings = patch.settings as Linha;
            estado.escritasEmOrg += 1;
          }
          return { data: { settings: estado.settings }, error: null };
        },
        // Nenhuma chave sobra depois da exclusão.
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
          Promise.resolve({ data: tabela === "ai_agent_versions" ? [] : null, error: null }).then(ok, erro),
      };
      return chain;
    },
  };
}

async function excluir() {
  const res = await DELETE(
    new NextRequest(`http://localhost/api/v1/ai/credentials/${ID}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: ID }) },
  );
  return { status: res.status, corpo: await res.json() };
}

const acoesAuditadas = () => vi.mocked(audit).mock.calls.map(([a]) => a.action);

beforeEach(() => {
  vi.clearAllMocks();
  env.JEV_PLATFORM_API_KEY = "plataforma_segredo";
  estado = {
    provider: "typesafe",
    settings: { jev: { ligado: true, modo: "decide", aceite: ACEITE } },
    assinatura: ELEGIVEL,
    escritasEmOrg: 0,
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG, role: "admin", name: "Org" },
    user: { id: USUARIO, idioma: "pt-BR" },
  } as Awaited<ReturnType<typeof requireRole>>);
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin() as unknown as ReturnType<typeof createAdminClient>);
});

describe("DELETE /api/v1/ai/credentials/:id — a plataforma cobre a chave apagada", () => {
  it("empresa elegível: apagar a última chave própria NÃO desliga, sem escrita e sem auditoria do desligamento", async () => {
    const { status, corpo } = await excluir();
    expect(status).toBe(200);
    expect(corpo.data).toMatchObject({ deleted: true, jev_desligado: false });
    expect(estado.escritasEmOrg).toBe(0);
    expect(estado.settings.jev).toMatchObject({ ligado: true });
    expect(acoesAuditadas()).toEqual(["ai.credential_deleted"]);
    expect(JSON.stringify(corpo)).not.toContain("plataforma_segredo");
  });

  it("controle: chave da instalação vazia => desliga como sempre", async () => {
    env.JEV_PLATFORM_API_KEY = "";
    const { corpo } = await excluir();
    expect(corpo.data.jev_desligado).toBe(true);
    expect(acoesAuditadas()).toEqual(["ai.credential_deleted", "ai.jev.desligado"]);
  });

  it.each([
    ["empresa isenta", null],
    ["plano sem inclui_ia", { estado: "ativa", plano: { inclui_ia: false, ia_propria: false } }],
    ["plano com IA própria", { estado: "ativa", plano: { inclui_ia: true, ia_propria: true } }],
    ["assinatura cancelada", { estado: "cancelada", plano: { inclui_ia: true, ia_propria: false } }],
  ])("controle: %s não é servida => desliga", async (_n, assinatura) => {
    estado.assinatura = assinatura;
    const { corpo } = await excluir();
    expect(corpo.data.jev_desligado).toBe(true);
    expect(estado.settings.jev).toMatchObject({ ligado: false });
  });

  it("controle: origem OpenRouter nunca cai na plataforma => desliga ao apagar a credencial OpenRouter", async () => {
    estado.provider = "openrouter";
    estado.settings = { jev: { ligado: true, modo: "decide", origem: "openrouter", aceite: ACEITE } };
    const { corpo } = await excluir();
    expect(corpo.data.jev_desligado).toBe(true);
  });
});
