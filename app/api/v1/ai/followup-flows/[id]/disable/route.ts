import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/followup-flows/:id/disable — status='disabled' (manager+).
 * No-op ok (200, sem novo audit) se já estava disabled.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { ehProspeccao } from "@/lib/followup/superficies";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org: activeOrg } = authz;

  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("followup_flow_pointers")
    .select("id, status, surface")
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!existing) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  // ⚠️ RÉGUA DE CAMPANHA NÃO SE DESLIGA POR AQUI, e a recusa é o conserto de um
  // desfecho pior que o 42501 do banco: com o pointer `disabled`, o worker PULA
  // cada passo e o motor AVANÇA — o inscrito corre a régua inteira em tiques,
  // calado, e quem retomar a campanha o encontra no fim sem ter recebido nada.
  // Quem para a régua de uma campanha é a própria campanha (`Cancelar`, que
  // encerra as inscrições em `encerrarReguaDaCampanha`).
  if (existing.surface === "campaign") {
    return fail(
      "cadencia_no_ar",
      t("A régua de uma campanha se para na tela da campanha, em Cancelar."),
      422,
      { requestId },
    );
  }

  if (existing.status === "disabled") {
    return ok({ id, status: "disabled" }, { requestId });
  }

  // Régua de prospecção só se escreve pelo servidor (9020/9035: a sessão recebe
  // 42501 ao mudar o status de uma cadência OU da régua de uma campanha). O
  // papel já foi conferido acima.
  const escritor = ehProspeccao(existing.surface) ? createAdminClient() : supabase;
  const { data: updated, error: updErr } = await escritor
    .from("followup_flow_pointers")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .select("id, status, updated_at")
    .single();
  if (updErr || !updated) {
    return fail("internal_error", updErr?.message ?? "followup_flow_disable_failed", 500, {
      requestId,
    });
  }

  void audit({
    action: "followup_flow.disabled",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "followup_flow_pointer",
    resourceId: id,
    requestId,
  });

  return ok(updated, { requestId });
}
