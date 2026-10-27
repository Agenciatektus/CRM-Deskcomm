/**
 * GET  /api/v1/inbox/filtros-salvos — os filtros nomeados do usuário na org ativa.
 * POST /api/v1/inbox/filtros-salvos — salva um (máximo 20 por usuário; nome único).
 *
 * Cliente do usuário, sem service_role: a RLS da `inbox_filtros_salvos` (9079) só
 * deixa ler, criar e apagar a linha PRÓPRIA da PRÓPRIA org. `filtros` passa pelo
 * schema zod: jsonb livre nunca entra.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { criarFiltroSalvoSchema, MAXIMO_DE_FILTROS_SALVOS } from "@/lib/inbox/filtros-salvos";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS = "id, nome, filtros, created_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "inbox_filtros_salvos" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_filtros_salvos")
    .select(COLS)
    .eq("organization_id", org.orgId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", "Erro ao listar filtros salvos.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "inbox_filtros_salvos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const parsed = criarFiltroSalvoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_filtros_salvos")
    .insert({ organization_id: org.orgId, user_id: user.id, ...parsed.data })
    .select(COLS)
    .single();
  if (error?.code === "23505") {
    return fail("conflict", t("Já existe um filtro salvo com esse nome."), 409, { requestId });
  }
  // FS020: o teto de 20 do trigger (a corrida entre dois pedidos só o banco enxerga).
  if (error?.code === "FS020") {
    return fail(
      "limit_reached",
      `${t("Limite de filtros salvos atingido.")} (${MAXIMO_DE_FILTROS_SALVOS})`,
      422,
      { requestId },
    );
  }
  if (error || !data) return fail("internal_error", "Erro ao salvar o filtro.", 500, { requestId });
  return ok(data, { requestId, status: 201 });
}
