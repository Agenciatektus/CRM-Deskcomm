import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/cadencias?pipeline_id=… — cadências de prospecção do funil (viewer+).
 * POST /api/v1/cadencias — cria o RASCUNHO de uma cadência no funil (manager+).
 *
 * A cadência é um pointer de follow-up com `surface='cadence'` (migration 9016).
 * Funil e número vêm do body, mas são RELIDOS com a organização da sessão antes
 * de gravar: id de outro tenant no body responde o mesmo 404 de "não existe".
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { CADENCE_SETTINGS_PADRAO } from "@/lib/cadencia/settings";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, name, status, active_version_id, trigger_config, pipeline_id, channel_session_id, cadence_settings, updated_at";

const criarSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  pipeline_id: z.string().uuid(),
  channel_session_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;
  const pipelineId = req.nextUrl.searchParams.get("pipeline_id");
  if (!pipelineId || !z.string().uuid().safeParse(pipelineId).success) {
    return fail("invalid_request", "pipeline_id inválido.", 400, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followup_flow_pointers")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("surface", "cadence")
    .eq("pipeline_id", pipelineId)
    .order("updated_at", { ascending: false });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  // Quantos estão NA RÉGUA agora, por cadência — o número que a tela mostra no card.
  const ids = (data ?? []).map((c) => c.id as string);
  const vivos = new Map<string, number>();
  if (ids.length > 0) {
    const { data: inscricoes, error: insErr } = await supabase
      .from("followup_enrollments")
      .select("pointer_id")
      .eq("organization_id", authz.org.orgId)
      .in("pointer_id", ids)
      .in("status", ["active", "waiting_reply", "paused_handoff", "dormente"]);
    if (insErr) return fail("internal_error", insErr.message, 500, { requestId });
    for (const i of inscricoes ?? []) vivos.set(i.pointer_id as string, (vivos.get(i.pointer_id as string) ?? 0) + 1);
  }
  return ok(
    (data ?? []).map((c) => ({ ...c, na_regua: vivos.get(c.id as string) ?? 0 })),
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = criarSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const admin = createAdminClient();
  const { data: funil } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", parsed.data.pipeline_id)
    .maybeSingle();
  if (!funil) return fail("not_found", t("Funil não encontrado."), 404, { requestId });

  if (parsed.data.channel_session_id) {
    const { data: sessao } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", parsed.data.channel_session_id)
      .is("archived_at", null)
      .maybeSingle();
    if (!sessao) return fail("not_found", t("Número não encontrado."), 404, { requestId });
  }

  const { data: criada, error } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: orgId,
      name: parsed.data.name,
      surface: "cadence",
      pipeline_id: parsed.data.pipeline_id,
      channel_session_id: parsed.data.channel_session_id ?? null,
      // A cadência nasce PARANDO na resposta: régua que continua falando com quem
      // respondeu é o comportamento que queima o número.
      trigger_config: { kind: "manual", cancel_on_reply: true },
      // Política padrão SEM a base legal: a publicação a exige, e ninguém a
      // escolhe por quem vai responder por ela.
      cadence_settings: CADENCE_SETTINGS_PADRAO,
    })
    .select(COLUNAS)
    .single();
  if (error || !criada) {
    if (error?.code === "23505") return fail("conflict", t("Já existe um fluxo com este nome."), 409, { requestId });
    return fail("internal_error", error?.message ?? "cadencia_insert_failed", 500, { requestId });
  }

  void audit({
    action: "followup_flow.created",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "followup_flow_pointer",
    resourceId: criada.id as string,
    requestId,
    metadata: { name: parsed.data.name, surface: "cadence", pipeline_id: parsed.data.pipeline_id },
  });
  return ok({ ...criada, na_regua: 0 }, { requestId, status: 201 });
}
