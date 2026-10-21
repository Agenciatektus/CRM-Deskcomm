// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { loadAuthUser } from "@/lib/auth/server";
import { orgAtivaDaApi } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthUser } from "@/lib/auth/types";

/**
 * Quem VÊ a foto de uma pessoa: ela mesma e quem está na mesma organização
 * ativa. Fora disso, 404 — igual a "sem foto". Controle negativo: o mesmo alvo,
 * com o vínculo presente, devolve 307.
 */

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ orgAtivaDaApi: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const EU = "11111111-1111-4111-8111-111111111111";
const COLEGA = "55555555-5555-4555-8555-555555555555";
const ORG = "22222222-2222-4222-8222-222222222222";

function eu(): AuthUser {
  return { id: EU, email: "eu@x.test", idioma: "pt-BR", organizations: [] } as unknown as AuthUser;
}

function espiao({ vinculo, caminho }: { vinculo: boolean; caminho: string | null }) {
  const filtros: Array<[string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq: (coluna: string, valor: unknown) => {
      filtros.push([coluna, valor]);
      return builder;
    },
    is: () => builder,
    maybeSingle: async () => ({ data: vinculo ? { user_id: COLEGA } : null, error: null }),
  };
  const client = {
    from: () => builder,
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { app_metadata: { avatar_path: caminho } } } })) } },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s.test/assinada" }, error: null }) }) },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return { filtros };
}

const pedir = async (id: string) => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/v1/usuarios/${id}/foto`), { params: Promise.resolve({ id }) });
};

describe("GET /api/v1/usuarios/[id]/foto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAuthUser).mockResolvedValue(eu());
    vi.mocked(orgAtivaDaApi).mockResolvedValue({ ok: true, org: { orgId: ORG, name: "Org", role: "agent" } });
  });

  it("a própria pessoa vê a própria foto (307 para a URL assinada, cache privado)", async () => {
    espiao({ vinculo: false, caminho: `usuarios/${EU}/33333333-3333-4333-8333-333333333333.png` });
    const res = await pedir(EU);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://s.test/assinada");
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("colega da MESMA organização ativa vê a foto — o filtro de organização vem da sessão", async () => {
    const e = espiao({ vinculo: true, caminho: `usuarios/${COLEGA}/33333333-3333-4333-8333-333333333333.png` });
    const res = await pedir(COLEGA);
    expect(res.status).toBe(307);
    expect(e.filtros).toContainEqual(["organization_id", ORG]);
    expect(e.filtros).toContainEqual(["user_id", COLEGA]);
  });

  it("controle negativo: pessoa de OUTRA organização → 404, sem assinar nada", async () => {
    espiao({ vinculo: false, caminho: `usuarios/${COLEGA}/33333333-3333-4333-8333-333333333333.png` });
    const res = await pedir(COLEGA);
    expect(res.status).toBe(404);
  });

  it("ponteiro que aponta para a foto de OUTRA pessoa não é servido", async () => {
    espiao({ vinculo: true, caminho: `usuarios/${EU}/33333333-3333-4333-8333-333333333333.png` });
    const res = await pedir(COLEGA);
    expect(res.status).toBe(404);
  });

  it("sem foto: 404 guardável (o fallback de iniciais assume)", async () => {
    espiao({ vinculo: true, caminho: null });
    const res = await pedir(COLEGA);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("sem sessão: 401", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(null);
    espiao({ vinculo: true, caminho: null });
    expect((await pedir(COLEGA)).status).toBe(401);
  });

  it("id que não é uuid: 404 sem consultar nada", async () => {
    espiao({ vinculo: true, caminho: null });
    expect((await pedir("../x")).status).toBe(404);
  });
});
