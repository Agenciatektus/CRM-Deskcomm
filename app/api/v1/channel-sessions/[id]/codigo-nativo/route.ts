/**
 * POST /api/v1/channel-sessions/[id]/codigo-nativo: codigo de conexao por numero
 * (`XXXX-XXXX`) de um canal CRIADO pelo CRM. Admin + MFA; org da sessao; 1 pedido
 * a cada 30 s por canal; o codigo e sensivel (no-store, fora de log e auditoria).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { codigoHospedadoPorNumero } from "@/lib/channels/connect";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const corpo = z.object({ telefone: z.string().trim().min(8).max(32) }).strict();

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
  const body = corpo.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return fail("validation_error", t("Informe o telefone com DDD."), 400, { requestId, headers });
  }

  const r = await codigoHospedadoPorNumero(createAdminClient(), authz.org.orgId, path.data.id, body.data.telefone, async () => authz.user.id);
  if (!r) return fail("not_found", "Canal não encontrado.", 404, { requestId, headers });
  if (r.status === 200) return ok(r.corpo, { requestId, headers });
  const msg: Record<number, string> = {
    400: t("Informe o telefone com DDD."),
    409: t("Este canal não aceita conexão agora."),
    429: t("Aguarde 30 segundos antes de pedir outro código."),
  };
  return fail(r.estado, msg[r.status] ?? t("Não foi possível gerar o código. Tente novamente."), r.status, {
    requestId,
    headers: { ...headers, ...(r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {}) },
  });
}
