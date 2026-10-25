/**
 * GET /api/v1/ads/meta/accounts — as contas de anúncio que o token alcança.
 *
 * Existe separada de `campaigns` porque responde a uma pergunta de outra
 * frequência: a lista de contas muda quando alguém ganha acesso a um cliente
 * novo (raro), e as métricas mudam o tempo todo. Fundir as duas faria toda
 * atualização da tabela gastar uma terceira chamada de cota para reconfirmar uma
 * lista que não mudou — e a cota é o recurso escasso aqui (a conta sondada está
 * em `development_access`).
 *
 * Piso `manager`: gasto de mídia é dado comercial, do mesmo grau de Evolução da
 * IA e Audit Log, os vizinhos desta tela no grupo Análise. `viewer` — que nesta
 * casa é quem só acompanha o próprio trabalho — não precisa ver orçamento.
 *
 * Org da org ativa (cookie validado), NUNCA do query/body. Read-only ⇒ sem
 * audit, mesma regra de `metrics/attendants`.
 */
import { randomUUID } from "node:crypto";

import { requireRole } from "@/lib/auth/require-role";
import { listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { fail, ok } from "@/lib/api/wrappers";
import { contaPermitida, podeAmpliarContas } from "@/lib/plataformas-de-anuncio/contas-permitidas";
import { createAdminClient } from "@/lib/supabase/admin";

import { respostaDeFalha, respostaSemConexao } from "../_falha";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  // `?todas=1` = todas as contas que o login alcança, para o admin escolher quais
  // são deste cliente. Sem ele, só as permitidas (nunca as de outro cliente).
  const todas = new URL(request.url).searchParams.get("todas") === "1";
  const authz = await requireRole(todas ? "admin" : "manager", { requestId, resource: "ads_insights" });
  if (!authz.ok) return authz.response;
  const { org, user } = authz;

  // Admin client: `ad_insights_connections` tem RLS ligada e ZERO policies
  // (0214). Pelo client de sessão isto devolveria vazio, sem erro.
  const admin = createAdminClient();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) return respostaSemConexao(credencial.motivo, { requestId });

  // Listar tudo = poder escolher contas de qualquer cliente: só quem conectou a Meta
  // (ou platform admin). Os demais admins escolhem dentro da lista já liberada.
  if (todas && !podeAmpliarContas(user, credencial.credencial.connectedBy)) {
    return fail("forbidden_role", "Só quem conectou a Meta ou o suporte pode liberar outras contas.", 403, { requestId });
  }

  const permitidas = todas ? null : credencial.credencial.contasPermitidas;
  // Lista vazia: nem chama a plataforma.
  if (permitidas !== null && permitidas.length === 0) {
    return ok({ contas: [], conta_padrao: null, restrita: true }, { requestId });
  }

  const contas = await listarContas(credencial.credencial.accessToken);
  if (!contas.ok) return respostaDeFalha(contas.falha, contas.detalhe, { requestId });

  return ok(
    {
      contas: contas.dados.filter((c) => contaPermitida(permitidas, c.id)),
      conta_padrao:
        credencial.credencial.contaPadrao && contaPermitida(permitidas, credencial.credencial.contaPadrao)
          ? credencial.credencial.contaPadrao
          : null,
      restrita: permitidas !== null,
      // Só na visão do admin: o que está marcado hoje.
      ...(todas ? { permitidas: credencial.credencial.contasPermitidas } : {}),
    },
    { requestId },
  );
}
