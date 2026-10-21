// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

import { loadAuthUser } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import type { AuthUser } from "@/lib/auth/types";

/**
 * A FOTO DE PERFIL — só a da própria sessão, só PNG/JPG/WebP, até 1 MB.
 *
 * Controle negativo em cada recusa: o MESMO pedido com o arquivo certo passa
 * (o caso "sobe a foto da própria pessoa"), então a recusa vem da regra
 * medida, e não de um mock que recusa tudo.
 */

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const EU = "11111111-1111-4111-8111-111111111111";
const OUTRA = "99999999-9999-4999-8999-999999999999";
// Imagens DE VERDADE: a rota reencoda (tira EXIF/GPS), e bytes só com a
// assinatura não decodificam.
const base = () => sharp({ create: { width: 4, height: 4, channels: 3, background: "#123456" } });
const PNG = new Uint8Array(await base().png().toBuffer());
const WEBP = new Uint8Array(await base().webp().toBuffer());
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');

function eu(): AuthUser {
  return { id: EU, email: "eu@x.test", idioma: "pt-BR", organizations: [] } as unknown as AuthUser;
}

function espiao(anterior: string | null = null) {
  const uploads: string[] = [];
  const removidos: string[] = [];
  const gravacoes: Array<{ id: string; attrs: Record<string, unknown> }> = [];
  const client = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: { app_metadata: { avatar_path: anterior } } } })),
        updateUserById: vi.fn(async (id: string, attrs: Record<string, unknown>) => {
          gravacoes.push({ id, attrs });
          return { error: null };
        }),
      },
    },
    storage: {
      from: () => ({
        upload: async (caminho: string) => {
          uploads.push(caminho);
          return { error: null };
        },
        remove: async (caminhos: string[]) => {
          removidos.push(...caminhos);
          return { error: null };
        },
      }),
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return { uploads, removidos, gravacoes };
}

function envio(bytes: Uint8Array, tipoDeclarado = "image/png"): NextRequest {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], "foto", { type: tipoDeclarado }));
  return new NextRequest("http://localhost/api/v1/perfil/foto", { method: "POST", body: form });
}

describe("POST /api/v1/perfil/foto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAuthUser).mockResolvedValue(eu());
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as Awaited<ReturnType<typeof checkRateLimit>>);
  });

  it("sobe a foto da PRÓPRIA pessoa: caminho no prefixo dela e ponteiro gravado nela", async () => {
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(PNG));
    expect(res.status).toBe(200);
    expect(e.uploads).toHaveLength(1);
    expect(e.uploads[0]).toMatch(new RegExp(`^usuarios/${EU}/[0-9a-f-]{36}\\.png$`));
    expect(e.gravacoes).toEqual([
      { id: EU, attrs: { app_metadata: { avatar_path: e.uploads[0] }, user_metadata: { avatar_url: null } } },
    ]);
    const corpo = await res.json();
    expect(corpo.data.avatar_url).toMatch(new RegExp(`^/api/v1/usuarios/${EU}/foto\\?v=`));
  });

  it("WebP passa (o tipo sai dos bytes)", async () => {
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(WEBP, "image/webp"));
    expect(res.status).toBe(200);
    expect(e.uploads[0]).toMatch(/\.webp$/);
  });

  it("tipo recusado pelos BYTES, mesmo declarando image/png (GIF)", async () => {
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(GIF, "image/png"));
    expect(res.status).toBe(415);
    expect(e.uploads).toHaveLength(0);
    expect(e.gravacoes).toHaveLength(0);
  });

  it("SVG recusado com código próprio", async () => {
    espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(SVG, "image/svg+xml"));
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("foto_svg_recusada");
  });

  it("acima de 1 MB: 413, sem subir nada", async () => {
    const e = espiao();
    const grande = new Uint8Array(1024 * 1024 + 1);
    grande.set(PNG);
    const { POST } = await import("./route");
    const res = await POST(envio(grande));
    expect(res.status).toBe(413);
    expect(e.uploads).toHaveLength(0);
  });

  it("sem sessão: 401", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(null);
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(PNG));
    expect(res.status).toBe(401);
    expect(e.uploads).toHaveLength(0);
  });

  it("apaga a foto ANTERIOR quando é desta pessoa", async () => {
    const minha = `usuarios/${EU}/33333333-3333-4333-8333-333333333333.png`;
    const e = espiao(minha);
    const { POST } = await import("./route");
    await POST(envio(PNG));
    expect(e.removidos).toEqual([minha]);
  });

  it("controle negativo: ponteiro adulterado para a foto de OUTRA pessoa não é apagado", async () => {
    const alheia = `usuarios/${OUTRA}/33333333-3333-4333-8333-333333333333.png`;
    const e = espiao(alheia);
    const { POST } = await import("./route");
    const res = await POST(envio(PNG));
    expect(res.status).toBe(200);
    expect(e.removidos).not.toContain(alheia);
    expect(e.gravacoes.every((g) => g.id === EU)).toBe(true);
  });
});

describe("DELETE /api/v1/perfil/foto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadAuthUser).mockResolvedValue(eu());
  });

  it("tira o ponteiro e apaga o arquivo da própria pessoa", async () => {
    const minha = `usuarios/${EU}/33333333-3333-4333-8333-333333333333.jpg`;
    const e = espiao(minha);
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest("http://localhost/api/v1/perfil/foto", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(e.gravacoes[0]).toEqual({
      id: EU,
      attrs: { app_metadata: { avatar_path: null }, user_metadata: { avatar_url: null } },
    });
    expect(e.removidos).toEqual([minha]);
  });
});
