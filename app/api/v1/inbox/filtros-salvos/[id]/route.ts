/**
 * DELETE /api/v1/inbox/filtros-salvos/[id] — apaga um filtro salvo PRÓPRIO.
 * Sem PATCH: renomear = apagar e criar. A RLS (9079) barra linha de outro usuário
 * ou de outra org: o `.select()` devolve vazio e a resposta é 404, nunca 204 falso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "inbox_filtros_salvos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("not_found", t("Filtro salvo não encontrado."), 404, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_filtros_salvos")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao apagar o filtro.", 500, { requestId });
  if (!data) return fail("not_found", t("Filtro salvo não encontrado."), 404, { requestId });
  return noContent(requestId);
}
