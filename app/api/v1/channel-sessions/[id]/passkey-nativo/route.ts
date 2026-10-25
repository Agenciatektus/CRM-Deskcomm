/**
 * POST /api/v1/channel-sessions/[id]/passkey-nativo: repassa ao FZAP a assertion de
 * passkey assinada pela extensao no WhatsApp Web, para um canal CRIADO pelo CRM.
 * Admin + MFA; org da sessao; corpo JSON com teto de 8 KB; no-store; a assertion
 * nunca vai para log nem auditoria.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { enviarPasskeyHospedada, PASSKEY_MAX_BYTES } from "@/lib/channels/connect";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Le o corpo ate o teto; passou, `null`. Nao confia em Content-Length. */
async function lerCorpoLimitado(req: Request): Promise<unknown> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > PASSKEY_MAX_BYTES) return null;
  const texto = await req.text().catch(() => "");
  if (!texto || new TextEncoder().encode(texto).length > PASSKEY_MAX_BYTES) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const headers: Record<string, string> = { "Cache-Control": "no-store, max-age=0" };
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!authz.ok) return authz.response;
  if (await mfaEmDivida()) {
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId, headers });
  }
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const path = z.object({ id: z.string().uuid() }).safeParse(await params);
  if (!path.success) return fail("not_found", "Canal não encontrado.", 404, { requestId, headers });
  const corpo = await lerCorpoLimitado(req);
  if (corpo === null) {
    return fail("validation_error", t("A chave de acesso veio em um formato inválido."), 400, { requestId, headers });
  }

  const r = await enviarPasskeyHospedada(createAdminClient(), authz.org.orgId, path.data.id, corpo, async () => authz.user.id);
  if (!r) return fail("not_found", "Canal não encontrado.", 404, { requestId, headers });
  if (r.status === 200) return ok(r.corpo, { requestId, headers });
  const msg: Record<number, string> = {
    400: t("A chave de acesso veio em um formato inválido."),
    409: t("Este canal não aceita conexão agora."),
    429: t("Muitas tentativas. Aguarde um instante."),
  };
  return fail(r.estado, msg[r.status] ?? t("Não foi possível enviar a chave de acesso. Tente novamente."), r.status, {
    requestId,
    headers: { ...headers, ...(r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {}) },
  });
}
