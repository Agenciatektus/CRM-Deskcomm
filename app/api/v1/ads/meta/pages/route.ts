/**
 * GET /api/v1/ads/meta/pages — as Páginas do Facebook que o token alcança.
 *
 * Alimenta o seletor de Página da identidade das vendas clique-para-WhatsApp.
 * Piso `admin`, org da org ativa, leitura ⇒ sem audit (ver `pixels/route.ts`).
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { podeAmpliarContas } from "@/lib/plataformas-de-anuncio/contas-permitidas";
import { requireRole } from "@/lib/auth/require-role";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { listarPaginas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { createAdminClient } from "@/lib/supabase/admin";

import { respostaDeFalha, respostaSemConexao } from "../_falha";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("admin", { requestId, resource: "ads_conversions" });
  if (!authz.ok) return authz.response;
  const { org, user } = authz;

  const admin = createAdminClient();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) return respostaSemConexao(credencial.motivo, { requestId });

  // As Páginas são do login inteiro (de todos os clientes dele): mesma regra de `?todas=1`.
  if (!podeAmpliarContas(user, credencial.credencial.connectedBy)) {
    return fail("forbidden_role", "Só quem conectou a Meta ou o suporte pode listar as Páginas.", 403, { requestId });
  }

  const paginas = await listarPaginas(credencial.credencial.accessToken);
  if (!paginas.ok) return respostaDeFalha(paginas.falha, paginas.detalhe, { requestId });

  return ok({ paginas: paginas.dados }, { requestId });
}
