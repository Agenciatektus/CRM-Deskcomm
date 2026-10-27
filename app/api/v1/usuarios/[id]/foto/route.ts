/**
 * GET /api/v1/usuarios/{id}/foto — serve a foto de perfil de uma PESSOA.
 *
 * Quem pode ver: a própria pessoa, e quem trabalha na MESMA organização (a
 * organização ativa da sessão, validada contra as memberships — nunca o path).
 * Fora disso a resposta é a mesma de "sem foto" (404): distinguir "existe, mas
 * não é para você" de "não existe" daria um oráculo de quem tem conta.
 *
 * Mesmo desenho de `/api/v1/contacts/[id]/avatar`: confere, assina uma URL curta
 * e redireciona, para o browser baixar direto do Storage e guardar no cache dele.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { loadAuthUser } from "@/lib/auth/server";
import { orgAtivaDaApi } from "@/lib/auth/require-role";
import { fotoDoUsuario } from "@/lib/fotos/foto";
import { larguraPedida, semFoto, servirFoto } from "@/lib/fotos/servidor";
import { fail } from "@/lib/api/wrappers";
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

  const admin = createAdminClient();
  if (id !== user.id) {
    const ativa = await orgAtivaDaApi(user, requestId);
    if (!ativa.ok) return ativa.response;
    if (!ativa.org) return semFoto();
    // Service role bypassa RLS: o filtro por organização vem da SESSÃO.
    const { data: vinculo } = await admin
      .from("user_organizations")
      .select("user_id")
      .eq("user_id", id)
      .eq("organization_id", ativa.org.orgId)
      .is("revoked_at", null)
      .maybeSingle();
    if (!vinculo) return semFoto();
  }

  const { data } = await admin.auth.admin.getUserById(id);
  const caminho = (data?.user?.app_metadata as Record<string, unknown> | undefined)?.avatar_path;
  if (typeof caminho !== "string" || !fotoDoUsuario(caminho, id)) return semFoto();

  return servirFoto(caminho, larguraPedida(req), req.nextUrl.searchParams.get("v"));
}
