/**
 * GET /api/v1/ads/meta/pixels?conta=act_<id> — os pixels (datasets) da conta.
 *
 * Alimenta o seletor da conexão de conversões, para o operador escolher em vez
 * de digitar o id. Piso `admin`: é configuração de conversão, a mesma tela que
 * grava o token. Org da org ativa, NUNCA do query. Leitura ⇒ sem audit.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { contaPermitida } from "@/lib/plataformas-de-anuncio/contas-permitidas";
import { requireRole } from "@/lib/auth/require-role";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { listarPixels } from "@/lib/plataformas-de-anuncio/meta/insights";
import { createAdminClient } from "@/lib/supabase/admin";

import { respostaContaNaoPermitida, respostaDeFalha, respostaSemConexao } from "../_falha";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("admin", { requestId, resource: "ads_conversions" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const conta = new URL(request.url).searchParams.get("conta") ?? "";
  if (!/^act_\d+$/.test(conta)) {
    return fail("validation_failed", "conta no formato act_<id>", 422, { requestId });
  }

  // Admin client: `ad_insights_connections` tem RLS sem policies (0214).
  const admin = createAdminClient();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) return respostaSemConexao(credencial.motivo, { requestId });

  if (!contaPermitida(credencial.credencial.contasPermitidas, conta)) {
    return respostaContaNaoPermitida({ requestId });
  }

  const pixels = await listarPixels(credencial.credencial.accessToken, conta);
  if (!pixels.ok) return respostaDeFalha(pixels.falha, pixels.detalhe, { requestId });

  return ok({ pixels: pixels.dados, conta_padrao: credencial.credencial.contaPadrao }, { requestId });
}
