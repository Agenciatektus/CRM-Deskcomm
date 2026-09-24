/**
 * POST /api/v1/cadencias/:id/preview — como cada variante sai para um negócio de
 * amostra (manager+, quem edita a régua).
 *
 * Usa `valoresDoNegocio`, a MESMA leitura que o motor faz na hora do envio: um
 * preview com outra fonte de dados mostraria um texto e o WhatsApp levaria outro.
 * O negócio de amostra é relido com a organização da SESSÃO e precisa ser do funil
 * da cadência — id de fora vira o mesmo 404 de "não existe" (sem enumeração).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { renderizarMensagemDaCadencia } from "@/lib/cadencia/render";
import { valoresDoNegocio } from "@/lib/cadencia/valores";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const corpoSchema = z.strictObject({
  lead_id: z.string().uuid(),
  variantes: z.array(z.string().min(1).max(1000)).min(1).max(10),
});

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return fail("invalid_request", "id inválido.", 400, { requestId });
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
  const parsed = corpoSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const admin = createAdminClient();
  const [{ data: cadencia }, { data: negocio }] = await Promise.all([
    admin
      .from("followup_flow_pointers")
      .select("id, pipeline_id")
      .eq("organization_id", orgId)
      .eq("id", id)
      .eq("surface", "cadence")
      .maybeSingle(),
    admin
      .from("crm_leads")
      .select("id, pipeline_id, contact_id")
      .eq("organization_id", orgId)
      .eq("id", parsed.data.lead_id)
      .maybeSingle(),
  ]);
  if (!cadencia) return fail("not_found", t("Cadência não encontrada."), 404, { requestId });
  if (!negocio || negocio.pipeline_id !== cadencia.pipeline_id || !negocio.contact_id) {
    return fail("not_found", t("Negócio não encontrado neste funil."), 404, { requestId });
  }

  const valores = await valoresDoNegocio(admin, orgId, {
    pipelineId: cadencia.pipeline_id as string,
    contactId: negocio.contact_id as string,
    leadId: negocio.id as string,
  });
  const variantes = parsed.data.variantes.map((texto, indice) => {
    // Cada variante isolada: a tela mostra TODAS, não a sorteada para este lead.
    const r = renderizarMensagemDaCadencia({ variantes: [texto], semente: `preview:${negocio.id}:${indice}`, valores });
    return r.ok ? { indice, ok: true, texto: r.texto } : { indice, ok: false, motivo: r.motivo, faltando: r.faltando };
  });
  return ok({ variantes }, { requestId });
}
