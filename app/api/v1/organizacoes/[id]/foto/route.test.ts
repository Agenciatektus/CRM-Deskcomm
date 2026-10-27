// @vitest-environment node
import sharp from "sharp";
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

function espiao(caminho: string | null, original?: Buffer) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { foto_path: caminho }, error: null }),
  };
  const client = {
    from: () => builder,
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://s.test/a" }, error: null }),
        download: async () => ({ data: original ? new Blob([new Uint8Array(original)]) : null, error: null }),
      }),
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
}

const pedir = async (id: string, consulta = "") => {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/v1/organizacoes/${id}/foto${consulta}`), { params: Promise.resolve({ id }) });
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

  describe("?w=", () => {
    const grande = () =>
      sharp({ create: { width: 800, height: 800, channels: 3, background: "#c33" } })
        .png({ compressionLevel: 0 })
        .toBuffer();

    it("w válido devolve 200 webp menor que o original, com cache imutável e privado", async () => {
      const original = await grande();
      vi.mocked(loadAuthUser).mockResolvedValue(usuario([ORG]));
      espiao(DA_ORG, original);
      const res = await pedir(ORG, "?v=abc&w=64");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
      expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(64);
      expect(64 * 64).toBeLessThan(original.length);
    });

    it("w inválido ou ausente segue como hoje (307 para o original)", async () => {
      vi.mocked(loadAuthUser).mockResolvedValue(usuario([ORG]));
      espiao(DA_ORG, await grande());
      expect((await pedir(ORG, "?w=63")).status).toBe(307);
      expect((await pedir(ORG, "?w=abc")).status).toBe(307);
      expect((await pedir(ORG)).status).toBe(307);
    });

    it("falha do sharp (arquivo ilegível) cai no original, não em 500", async () => {
      vi.mocked(loadAuthUser).mockResolvedValue(usuario([ORG]));
      espiao(DA_ORG, Buffer.from("isto não é imagem"));
      expect((await pedir(ORG, "?w=64")).status).toBe(307);
    });

    it("vínculo negado com w continua 404 e sem sessão 401", async () => {
      vi.mocked(loadAuthUser).mockResolvedValue(usuario([OUTRA]));
      espiao(DA_ORG, await grande());
      expect((await pedir(ORG, "?w=64")).status).toBe(404);
      vi.mocked(loadAuthUser).mockResolvedValue(null);
      expect((await pedir(ORG, "?w=64")).status).toBe(401);
    });
  });
});
