import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/leads?search=… — busca de leads (a paleta Ctrl K).
 * POST /api/v1/leads — create lead (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createLeadSchema, validateRequest, type CreateLeadInput } from "@/lib/schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { buscarLeads, termoDaBuscaDeLeads, TETO_DE_LEADS } from "@/lib/leads/busca-de-leads";
import { createClient } from "@/lib/supabase/server";

import { createLeadHandler } from "./_handler";

export const dynamic = "force-dynamic";

/**
 * Só BUSCA, de propósito: listar todos os leads da organização seria o endpoint
 * pesado que a regra proíbe, e o quadro já tem a rota dele. Sem `search` válido
 * (2 a 100 caracteres) a resposta é 422, não a lista inteira.
 *
 * `viewer`+ e o cliente da SESSÃO: a RLS de `crm_leads` decide o que cada papel
 * acha, e a organização entra à mão (ver `lib/leads/busca-de-leads.ts`).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const url = new URL(req.url);
  const termo = termoDaBuscaDeLeads(url.searchParams.get("search") ?? "");
  if (termo === null) {
    return fail("validation_failed", t("A busca precisa de 2 a 100 caracteres."), 422, { requestId });
  }
  const pedido = Number(url.searchParams.get("limit") ?? TETO_DE_LEADS);
  const limite = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, TETO_DE_LEADS) : TETO_DE_LEADS;

  const supabase = await createClient();
  try {
    return ok(await buscarLeads(supabase, authz.org.orgId, termo, limite), { requestId });
  } catch (erroDaBusca) {
    console.error("[leads] busca falhou:", erroDaBusca instanceof Error ? erroDaBusca.message : erroDaBusca, {
      requestId,
    });
    return fail("internal_error", t("Erro ao buscar os leads."), 500, { requestId });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(createLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();

  try {
    const lead = await createLeadHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: authUser.id },
        requestId,
        idioma: authUser.idioma,
      },
      input as CreateLeadInput,
    );
    return ok(lead, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
