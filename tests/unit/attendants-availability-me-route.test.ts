/**
 * `GET /api/v1/attendants/availability/me`: a chave de plantão de QUEM PERGUNTA.
 *
 * Nasceu da revisão do @Cassio_SecRev (P1): o botão do topo lia o roster, que
 * resolve nome e e-mail da equipe inteira pelo admin client. O que se prende:
 * papel mínimo `agent` (viewer e anônimo barrados ANTES de tocar o banco), sem
 * admin client, filtro pelo id da SESSÃO e pela org ativa, e só o próprio
 * estado na resposta (nada de e-mail, nome, capacidade ou jornada).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";

function sessao(papel: Role | null) {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    papel === null
      ? { ok: false, response: fail("unauthorized", "Não autenticado.", 401, {}) }
      : ROLE_RANK[papel] >= ROLE_RANK[min]
        ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
        : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

/** Dublê do client do usuário que GRAVA os filtros pedidos. */
function clienteDoUsuario(linha: Record<string, unknown> | null) {
  const filtros: Array<[string, unknown]> = [];
  const colunas: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: (c: string) => {
      colunas.push(c);
      return chain;
    },
    eq: (col: string, v: unknown) => {
      filtros.push([col, v]);
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: linha, error: null }),
  };
  const from = vi.fn(() => chain);
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  return { filtros, colunas, from };
}

async function chamar() {
  const { GET } = await import("@/app/api/v1/attendants/availability/me/route");
  return GET(new NextRequest("http://localhost/api/v1/attendants/availability/me"));
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createAdminClient).mockReset();
});

describe("GET /attendants/availability/me", () => {
  it("agent recebe só o PRÓPRIO estado, filtrado pela sessão e pela org ativa", async () => {
    sessao("agent");
    const dublê = clienteDoUsuario({ user_id: ANA, is_available: true });
    const res = await chamar();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data).toEqual({ user_id: ANA, is_available: true });
    expect(dublê.from).toHaveBeenCalledWith("attendant_availability");
    expect(dublê.filtros).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["user_id", ANA],
      ]),
    );
    // Nenhuma coluna além do estado: sem capacidade, jornada nem heartbeat.
    expect(dublê.colunas).toEqual(["user_id, is_available"]);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("sem linha devolve null (nunca configurou), sem inventar estado", async () => {
    sessao("agent");
    clienteDoUsuario(null);
    const corpo = await (await chamar()).json();
    expect(corpo.data).toBeNull();
  });

  it("viewer é barrado antes de tocar o banco", async () => {
    sessao("viewer");
    const res = await chamar();
    expect(res.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("anônimo é barrado antes de tocar o banco", async () => {
    sessao(null);
    const res = await chamar();
    expect(res.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });
});
