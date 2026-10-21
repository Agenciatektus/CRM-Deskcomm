// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthUser } from "@/lib/auth/types";

/**
 * A FOTO DA ORGANIZAÇÃO — admin da empresa, só a organização ATIVA (a de
 * `requireRole`, cookie validado), nunca outra. Controle negativo: o mesmo
 * envio passa para o admin; o atendente leva o 403 do gate e nada sobe.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "77777777-7777-4777-8777-777777777777";
const USER = "11111111-1111-4111-8111-111111111111";
const PNG = new Uint8Array(
  await sharp({ create: { width: 4, height: 4, channels: 3, background: "#123456" } }).png().toBuffer(),
);
const PDF = new TextEncoder().encode("%PDF-1.7 qualquer coisa");

function admin() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER, idioma: "pt-BR" } as unknown as AuthUser,
    org: { orgId: ORG, name: "Org", role: "admin" },
  });
}

function espiao(anterior: string | null = null) {
  const uploads: string[] = [];
  const removidos: string[] = [];
  const updates: Array<{ valores: unknown; id: unknown }> = [];
  let pendente: unknown = null;
  const builder = {
    select: () => builder,
    update: (valores: unknown) => {
      pendente = valores;
      return builder;
    },
    eq: (_c: string, valor: unknown) => {
      if (pendente) {
        updates.push({ valores: pendente, id: valor });
        pendente = null;
      }
      return builder;
    },
    maybeSingle: async () => ({ data: { id: ORG, foto_path: anterior }, error: null }),
  };
  const client = {
    from: (tabela: string) => {
      expect(tabela).toBe("organizations");
      return builder;
    },
    storage: {
      from: () => ({
        upload: async (c: string) => {
          uploads.push(c);
          return { error: null };
        },
        remove: async (cs: string[]) => {
          removidos.push(...cs);
          return { error: null };
        },
      }),
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return { uploads, removidos, updates };
}

function envio(bytes: Uint8Array, extra?: Record<string, string>): NextRequest {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], "foto", { type: "image/png" }));
  for (const [k, v] of Object.entries(extra ?? {})) form.set(k, v);
  return new NextRequest("http://localhost/api/v1/organizacao/foto", { method: "POST", body: form });
}

describe("POST /api/v1/organizacao/foto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin();
  });

  it("admin sobe a foto da organização ATIVA: caminho e update na organização do gate", async () => {
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(PNG));
    expect(res.status).toBe(200);
    expect(e.uploads[0]).toMatch(new RegExp(`^organizacoes/${ORG}/[0-9a-f-]{36}\\.png$`));
    expect(e.updates).toEqual([{ valores: { foto_path: e.uploads[0] }, id: ORG }]);
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith("admin", expect.objectContaining({ allowPlatformAdmin: true }));
  });

  it("controle negativo: um campo `organization_id` no corpo não muda o alvo", async () => {
    const e = espiao();
    const { POST } = await import("./route");
    await POST(envio(PNG, { organization_id: OUTRA_ORG, org: OUTRA_ORG }));
    expect(e.uploads[0]).toContain(`organizacoes/${ORG}/`);
    expect(e.updates.every((u) => u.id === ORG)).toBe(true);
  });

  it("quem não é admin leva o 403 do gate e nada sobe", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden_role", message: "x" } }, { status: 403 }),
    } as Awaited<ReturnType<typeof requireRole>>);
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(PNG));
    expect(res.status).toBe(403);
    expect(e.uploads).toHaveLength(0);
    expect(e.updates).toHaveLength(0);
  });

  it("tipo recusado pelos bytes (PDF declarado como PNG): 415", async () => {
    const e = espiao();
    const { POST } = await import("./route");
    const res = await POST(envio(PDF));
    expect(res.status).toBe(415);
    expect(e.uploads).toHaveLength(0);
  });

  it("acima de 1 MB: 413", async () => {
    const e = espiao();
    const grande = new Uint8Array(1024 * 1024 + 10);
    grande.set(PNG);
    const { POST } = await import("./route");
    expect((await POST(envio(grande))).status).toBe(413);
    expect(e.uploads).toHaveLength(0);
  });

  it("foto anterior de OUTRA organização (ponteiro adulterado) não é apagada", async () => {
    const alheia = `organizacoes/${OUTRA_ORG}/33333333-3333-4333-8333-333333333333.png`;
    const e = espiao(alheia);
    const { POST } = await import("./route");
    await POST(envio(PNG));
    expect(e.removidos).not.toContain(alheia);
  });

  it("foto anterior da própria organização é apagada depois de gravar", async () => {
    const minha = `organizacoes/${ORG}/33333333-3333-4333-8333-333333333333.png`;
    const e = espiao(minha);
    const { POST } = await import("./route");
    await POST(envio(PNG));
    expect(e.removidos).toEqual([minha]);
  });
});
