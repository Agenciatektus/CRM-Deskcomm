/**
 * POST /api/v1/conversations/mark-all-read — "Marcar todas como lidas", só para
 * quem pede. Sem corpo: o servidor decide quais conversas entram (ver
 * `lib/inbox/marcar-todas-lidas.ts`, com as regras do lote). Não envia "visto" ao
 * cliente no WhatsApp, como a ação individual.
 */
import { randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { marcarTodasComoLidas } from "@/lib/inbox/marcar-todas-lidas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  try {
    // Cliente do USUÁRIO: a RLS limita ao que o papel enxerga.
    const resultado = await marcarTodasComoLidas(await createClient(), {
      orgId: authz.org.orgId,
      userId: authz.user.id,
    });
    await audit({
      action: "conversation.all_marked_read",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "conversation",
      metadata: { contadores: resultado.contadores, marcas: resultado.marcas, restam: resultado.restam },
      requestId,
    });
    return ok(resultado, { requestId });
  } catch (erro) {
    return fail("internal_error", erro instanceof Error ? erro.message : "erro", 500, { requestId });
  }
}
