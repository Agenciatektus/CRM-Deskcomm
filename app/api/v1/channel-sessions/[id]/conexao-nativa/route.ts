/**
 * GET /api/v1/channel-sessions/[id]/conexao-nativa: estado da conexao por QR de um
 * canal CRIADO pelo CRM (JSON com o QR em data URL). Reabre a conexao se ela caiu.
 * Admin + MFA; org sempre da sessao; QR e sensivel (no-store). Canal que nao e
 * nativo responde 404 (a vinculada nao passa por aqui).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { estadoDaConexaoHospedada } from "@/lib/channels/connect";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const headers: Record<string, string> = { "Cache-Control": "no-store, max-age=0" };
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!authz.ok) return authz.response;
  if (await mfaEmDivida()) {
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId, headers });
  }
  const path = z.object({ id: z.string().uuid() }).safeParse(await params);
  if (!path.success) return fail("not_found", "Canal não encontrado.", 404, { requestId, headers });

  const r = await estadoDaConexaoHospedada(createAdminClient(), authz.org.orgId, path.data.id, async () => authz.user.id);
  if (!r) return fail("not_found", "Canal não encontrado.", 404, { requestId, headers });
  if (r.status === 200) return ok(r.corpo, { requestId, headers });
  const t = (s: string) => traduzir(s, authz.user.idioma);
  const msg = r.status === 409 ? t("Este canal não aceita conexão agora.") : t("Não foi possível consultar a conexão.");
  return fail(r.estado, msg, r.status, {
    requestId,
    headers: { ...headers, ...(r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {}) },
  });
}
