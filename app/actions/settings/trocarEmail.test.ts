// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadAuthUser, mfaEmDivida } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/types";

/**
 * A troca de e-mail só PEDE ao GoTrue (que manda o link): nada grava o e-mail
 * novo antes da confirmação. Controle negativo das travas: o mesmo pedido, sem a
 * trava, chega ao `updateUser`; com ela, não chega.
 */

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(),
  mfaEmDivida: vi.fn(async () => false),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/email/estado", () => ({ semSmtpNaInstalacao: vi.fn(async () => false) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test/" } }));

const updateUser = vi.fn();

function eu(extra: Partial<AuthUser> = {}): AuthUser {
  return { id: "u1", email: "Atual@Empresa.com", idioma: "pt-BR", organizations: [], ...extra } as unknown as AuthUser;
}

describe("trocarEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUser.mockResolvedValue({ data: {}, error: null });
    vi.mocked(createClient).mockResolvedValue({ auth: { updateUser } } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(loadAuthUser).mockResolvedValue(eu());
    vi.mocked(mfaEmDivida).mockResolvedValue(false);
  });

  it("pede ao GoTrue com o link de volta em /auth/confirm?type=email_change e audita só o domínio", async () => {
    const { trocarEmail } = await import("./trocarEmail");
    const r = await trocarEmail({ email: " Nova@Outra.com " });
    expect(r).toEqual({ ok: true, novoEmail: "nova@outra.com" });
    expect(updateUser).toHaveBeenCalledWith(
      { email: "nova@outra.com" },
      { emailRedirectTo: "https://crm.exemplo.test/auth/confirm?type=email_change" },
    );
    const chamada = vi.mocked(audit).mock.calls[0]![0];
    expect(chamada.action).toBe("profile.email_change_requested");
    expect(JSON.stringify(chamada.metadata)).not.toContain("nova@");
  });

  it("o mesmo e-mail (ignorando caixa) é recusado sem chamar o GoTrue", async () => {
    const { trocarEmail } = await import("./trocarEmail");
    expect(await trocarEmail({ email: "atual@empresa.com" })).toEqual({ ok: false, error: "same_email" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("segundo fator em dívida: mfa_required, sem chamar o GoTrue", async () => {
    vi.mocked(mfaEmDivida).mockResolvedValue(true);
    const { trocarEmail } = await import("./trocarEmail");
    expect(await trocarEmail({ email: "nova@outra.com" })).toEqual({ ok: false, error: "mfa_required" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("modo suporte não troca o e-mail de ninguém", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(eu({ support: { access_mode: "support_readonly" } as AuthUser["support"] }));
    const { trocarEmail } = await import("./trocarEmail");
    expect(await trocarEmail({ email: "nova@outra.com" })).toEqual({ ok: false, error: "support_readonly" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("e-mail inválido: validation_failed", async () => {
    const { trocarEmail } = await import("./trocarEmail");
    expect(await trocarEmail({ email: "sem-arroba" })).toEqual({ ok: false, error: "validation_failed" });
  });

  it("e-mail já usado por outra conta vira mensagem própria", async () => {
    updateUser.mockResolvedValue({ data: {}, error: { code: "email_exists", status: 422, message: "x" } });
    const { trocarEmail } = await import("./trocarEmail");
    expect(await trocarEmail({ email: "nova@outra.com" })).toEqual({ ok: false, error: "email_in_use" });
    expect(audit).not.toHaveBeenCalled();
  });
});
