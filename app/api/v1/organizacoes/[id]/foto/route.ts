/**
 * GET /api/v1/organizacoes/{id}/foto — serve a foto de uma organização.
 *
 * Quem pode ver: quem tem vínculo ATIVO com ela (o seletor de organização mostra
 * as fotos das empresas da pessoa) e o platform admin. Fora disso, 404 igual ao
 * de "sem foto": não há oráculo de quais organizações existem.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";
import { fotoDaOrganizacao } from "@/lib/fotos/foto";
import { larguraPedida, semFoto, servirFoto } from "@/lib/fotos/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: bruto } = await ctx.params;

  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Faça login.", 401, { requestId });

  const lido = idSchema.safeParse(bruto);
  if (!lido.success) return semFoto();
  const id = lido.data;

  // As memberships do AuthUser já vêm filtradas por `revoked_at is null`.
  const membro = user.organizations.some((o) => o.organization_id === id);
  if (!membro && !user.is_platform_admin) return semFoto();

  const { data } = await createAdminClient()
    .from("organizations")
    .select("foto_path")
    .eq("id", id)
    .maybeSingle();
  const caminho = (data as { foto_path?: string | null } | null)?.foto_path ?? null;
  if (!caminho || !fotoDaOrganizacao(caminho, id)) return semFoto();

  return servirFoto(caminho, larguraPedida(req), req.nextUrl.searchParams.get("v"));
}
