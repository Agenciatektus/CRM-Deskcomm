import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET   /api/v1/cadencias/:id — a cadência com rascunho, política e o grafo no ar.
 * PATCH /api/v1/cadencias/:id — edita rascunho, gatilho, política e número (manager+).
 *
 * Publicar e desligar são as rotas de fluxo de sempre
 * (`/api/v1/ai/followup-flows/:id/publish|disable`), que para `surface='cadence'`
 * passam pela validação própria (`lib/cadencia/validar-publicacao.ts`).
 *
 * O número NÃO muda com a cadência no ar: a conversa de cada inscrito foi aberta
 * no número antigo, e o worker recusa enviar por um número que não é o da
 * cadência. Trocar exige desligar antes — a escolha fica visível para quem troca.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { validarEtapasDeSaida, validarGatilhoDaCadencia } from "@/lib/cadencia/gatilho";
import { MENSAGEM_ETIQUETA_ENTRA_E_SAI, etiquetaEntraESai } from "@/lib/cadencia/saidas";
import { cadenceSettingsSchema } from "@/lib/cadencia/settings";
import { triggerConfigSchema } from "@/lib/followup/api-schemas";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = z.string().uuid();
type RouteCtx = { params: Promise<{ id: string }> };

const COLUNAS =
  "id, name, status, surface, active_version_id, draft_graph, trigger_config, handoff_policy, pipeline_id, channel_session_id, cadence_settings, updated_at";

/** Rascunho aceita a política SEM base legal; a publicação a exige. */
const politicaDeRascunho = cadenceSettingsSchema.extend({
  legal_basis_ref: cadenceSettingsSchema.shape.legal_basis_ref.optional(),
});

const patchSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  draft_graph: flowGraphSchema.optional(),
  trigger_config: triggerConfigSchema.optional(),
  cadence_settings: politicaDeRascunho.optional(),
  channel_session_id: z.string().uuid().optional(),
});

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("viewer", { requestId, resource: "cadencias" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: cadencia, error } = await supabase
    .from("followup_flow_pointers")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("surface", "cadence")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!cadencia) return fail("not_found", traduzir("Cadência não encontrada.", authz.user.idioma), 404, { requestId });

  let grafoNoAr: unknown = null;
  if (cadencia.active_version_id) {
    const { data: versao } = await supabase
      .from("followup_flow_versions")
      .select("graph")
      .eq("organization_id", authz.org.orgId)
      .eq("id", cadencia.active_version_id as string)
      .maybeSingle();
    grafoNoAr = versao?.graph ?? null;
  }
  return ok({ ...cadencia, grafo_no_ar: grafoNoAr }, { requestId });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return fail("invalid_request", "id inválido.", 400, { requestId });
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
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const mudancas = parsed.data;

  const admin = createAdminClient();
  const { data: atual, error: atualErr } = await admin
    .from("followup_flow_pointers")
    .select("id, status, channel_session_id, pipeline_id, trigger_config, cadence_settings")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("surface", "cadence")
    .maybeSingle();
  if (atualErr) return fail("internal_error", atualErr.message, 500, { requestId });
  if (!atual) return fail("not_found", t("Cadência não encontrada."), 404, { requestId });

  if (mudancas.channel_session_id !== undefined && mudancas.channel_session_id !== atual.channel_session_id) {
    if (atual.status === "active") {
      return fail(
        "cadencia_no_ar",
        t("Desligue a cadência antes de trocar o número: as conversas dos inscritos estão no número atual."),
        409,
        { requestId },
      );
    }
    const { data: sessao } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", mudancas.channel_session_id)
      .is("archived_at", null)
      .maybeSingle();
    if (!sessao) return fail("not_found", t("Número não encontrado."), 404, { requestId });
  }

  if (mudancas.trigger_config !== undefined) {
    const problema = await validarGatilhoDaCadencia(
      admin,
      orgId,
      atual.pipeline_id as string | null,
      mudancas.trigger_config,
    );
    if (problema) return fail("cadencia_gatilho_invalido", t(problema), 422, { requestId });
  }

  // Com os valores FINAIS (o que muda agora sobre o que já estava gravado).
  if (
    etiquetaEntraESai(
      mudancas.trigger_config ?? atual.trigger_config,
      mudancas.cadence_settings ?? atual.cadence_settings,
    )
  ) {
    return fail("cadencia_etiqueta_entra_e_sai", t(MENSAGEM_ETIQUETA_ENTRA_E_SAI), 422, { requestId });
  }

  const etapasDeSaida = mudancas.cadence_settings?.saidas?.etapas ?? [];
  if (etapasDeSaida.length > 0) {
    const problema = await validarEtapasDeSaida(admin, orgId, atual.pipeline_id as string | null, etapasDeSaida);
    if (problema) return fail("cadencia_saida_invalida", t(problema), 422, { requestId });
  }

  // Com a cadência NO AR, a política vale para o próximo envio: tem de estar
  // completa (base legal inclusive) — o CHECK do banco recusaria de todo jeito.
  if (mudancas.cadence_settings && atual.status === "active") {
    const completa = cadenceSettingsSchema.safeParse(mudancas.cadence_settings);
    if (!completa.success) {
      return fail("validation_failed", t("Com a cadência no ar, a política precisa estar completa."), 422, {
        requestId,
        details: completa.error.flatten(),
      });
    }
  }

  const { data: salva, error } = await admin
    .from("followup_flow_pointers")
    .update({ ...mudancas, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error || !salva) {
    if (error?.code === "23505") return fail("conflict", t("Já existe um fluxo com este nome."), 409, { requestId });
    return fail("internal_error", error?.message ?? "cadencia_update_failed", 500, { requestId });
  }

  void audit({
    action: "followup_flow.updated",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "followup_flow_pointer",
    resourceId: id,
    requestId,
    metadata: { surface: "cadence", campos: Object.keys(mudancas) },
  });
  return ok(salva, { requestId });
}
