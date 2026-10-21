// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { loadAuthUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthUser } from "@/lib/auth/types";

/**
 * Quem VÊ a foto de uma organização: quem tem vínculo com ela (e o platform
 * admin). Controle negativo: a mesma organização, sem o vínculo, é 404.
 */

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA = "77777777-7777-4777-8777-777777777777";

function usuario(orgs: string[], platformAdmin = false): AuthUser {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "eu@x.test",
    idioma: "pt-BR",
    is_platform_admin: platformAdmin,
    organizations: orgs.map((organization_id) => ({ organization_id, organization_name: "O", role: "agent" })),
  } as unknown as AuthUser;
}

function espiao(caminho: string | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { foto_path: caminho }, error: null }),
  };
  const client = {
    from: () => builder,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s.test/a" }, error: null }) }) },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
}

const pedir = async (id: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/v1/organizacoes/${id}/foto`), { params: Promise.resolve({ id }) });
};

const DA_ORG = `organizacoes/${ORG}/33333333-3333-4333-8333-333333333333.webp`;

describe("GET /api/v1/organizacoes/[id]/foto", () => {
  beforeEach(() => vi.clearAllMocks());

  it("membro vê a foto da organização dele (307)", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(usuario([ORG]));
    espiao(DA_ORG);
    const res = await pedir(ORG);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://s.test/a");
  });

  it("controle negativo: quem não tem vínculo com ela leva 404", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(usuario([OUTRA]));
    espiao(DA_ORG);
    expect((await pedir(ORG)).status).toBe(404);
  });

  it("platform admin vê sem vínculo", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(usuario([], true));
    espiao(DA_ORG);
    expect((await pedir(ORG)).status).toBe(307);
  });

  it("ponteiro com caminho de OUTRA organização não é servido", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(usuario([ORG]));
    espiao(`organizacoes/${OUTRA}/33333333-3333-4333-8333-333333333333.png`);
    expect((await pedir(ORG)).status).toBe(404);
  });

  it("sem sessão: 401", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(null);
    espiao(DA_ORG);
    expect((await pedir(ORG)).status).toBe(401);
  });
});
