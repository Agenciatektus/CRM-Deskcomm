import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/cadencias/pausa — todas as cadências da organização estão pausadas? (viewer+)
 * POST /api/v1/cadencias/pausa `{ pausadas }` — o KILL SWITCH (manager+, MFA).
 *
 * Pausar não cancela ninguém: o worker relê a chave antes de cada envio e ADIA o
 * passo. É o botão de "parem tudo agora" — número sob risco, mensagem errada no
 * ar —, e por isso é um só, da organização, e não por cadência.
 *
 * Pela SESSÃO (nunca o admin client): a RPC reconfere papel, suporte de escrita e
 * MFA pelo `auth.uid()`; o `organization_id` vem da sessão, nunca do body.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const settings = (data?.settings ?? {}) as { cadencias_pausadas?: unknown };
  return ok({ pausadas: settings.cadencias_pausadas === true }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = z.strictObject({ pausadas: z.boolean() }).safeParse(raw);
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_definir_cadencias_pausadas", {
    p_org: authz.org.orgId,
    p_pausadas: parsed.data.pausadas,
  });
  if (error) {
    if (error.message.includes("mfa_required")) {
      return fail("mfa_required", t("Confirme o segundo fator para pausar ou retomar as cadências."), 403, { requestId });
    }
    if (error.code === "42501") return fail("forbidden", t("Sem permissão."), 403, { requestId });
    return fail("internal_error", error.message, 500, { requestId });
  }
  const resultado = data as { pausadas: boolean; mudou: boolean };
  if (resultado.mudou) {
    void audit({
      action: "followup_flow.updated",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "organization",
      resourceId: authz.org.orgId,
      requestId,
      metadata: { cadencias_pausadas: resultado.pausadas },
    });
  }
  return ok(resultado, { requestId });
}
