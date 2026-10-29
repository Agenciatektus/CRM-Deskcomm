/**
 * GET /api/v1/plataformas-de-anuncio/meta/callback: a volta do Login do
 * Facebook ("Conectar com Meta", leitura de anúncios).
 *
 * Irmã de `.../google/callback/route.ts`, com a mesma ordem de passos (que é
 * contrato): `error` da query antes de tudo (cancelar não é falha); `state`
 * antes do `code`; cookie de vínculo; régua de suporte; nonce queimado ANTES da
 * troca (o `code` é de uso único); troca code, token curto, token longo; cifra
 * e upsert pelo gravador compartilhado (`gravarConexaoDeLeitura`).
 *
 * É retorno de NAVEGADOR: todo desfecho volta para `/app/settings/meta-ads` com
 * `?conectado=1` (mais `contas`/`bms` ou `aviso`, ver `verificacao.ts`) ou `?erro=<código>`, nunca JSON. Nada de token, segredo ou
 * código vai para log ou para a URL de volta.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NOME_DO_VINCULO, vinculoConfere } from "@/lib/agenda/google/vinculo";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ponteDeVolta } from "@/lib/http/ponte-de-volta";
import { supportCallbackWriteAllowed } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { gravarConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura";
import {
  CAMINHO_DO_CALLBACK,
  configuracaoDoMetaAds,
} from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { segredoDoVinculo, verificarEstado } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import { aindaEAdminDaOrganizacao } from "@/lib/plataformas-de-anuncio/meta/oauth/papel";
import {
  type DesfechoDaVerificacao,
  desfechoDaVerificacao,
  parametrosDoDesfecho,
} from "@/lib/plataformas-de-anuncio/meta/oauth/verificacao";
import {
  lerIdentidadeDoToken,
  lerPerfilDoToken,
  obterTokenLongo,
} from "@/lib/plataformas-de-anuncio/meta/oauth/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export const dynamic = "force-dynamic";

function voltar(base: string, params: Record<string, string>): NextResponse {
  const url = new URL("/app/settings/meta-ads", base || "http://localhost:3000");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Ponte 200, não 302: o cookie de sessão Strict não viaja num redirect vindo da Meta/Google.
  const resposta = ponteDeVolta(url.toString());
  // Toda saída passa por aqui: o vínculo morre com o fluxo, sucesso ou erro.
  resposta.cookies.set(NOME_DO_VINCULO, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: CAMINHO_DO_CALLBACK,
    maxAge: 0,
  });
  return resposta;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const base = env.NEXT_PUBLIC_APP_URL;
  const url = new URL(req.url);

  // 1. Cancelamento não é erro.
  if (url.searchParams.get("error")) return voltar(base, { erro: "cancelado" });

  // 2. `state` antes do `code`. Sob `try`: a rota é pública e `verificarEstado`
  // lança com `INTERNAL_SECRET` curto, e sem isto seria 500.
  let estado: ReturnType<typeof verificarEstado>;
  try {
    estado = verificarEstado(url.searchParams.get("state"), {
      segredo: env.INTERNAL_SECRET,
      agora: new Date(),
    });
  } catch (erro) {
    logger.error("[plataformas-de-anuncio.meta.callback] state não verificável", {
      motivo: erro instanceof Error ? erro.message : String(erro),
    });
    return voltar(base, { erro: "estado_invalido" });
  }
  if (!estado) return voltar(base, { erro: "estado_invalido" });

  // O navegador que volta é o que saiu. Antes da queima do nonce, para que um
  // `state` vazado não derrube a volta legítima.
  if (
    !vinculoConfere(
      req.cookies.get(NOME_DO_VINCULO)?.value,
      estado.nonce,
      segredoDoVinculo(env.INTERNAL_SECRET),
    )
  ) {
    logger.warn("[plataformas-de-anuncio.meta.callback] vínculo do navegador não confere", {
      organizationId: estado.organizationId,
    });
    return voltar(base, { erro: "estado_invalido" });
  }

  const code = url.searchParams.get("code");
  if (!code) return voltar(base, { erro: "sem_codigo" });

  const app = configuracaoDoMetaAds();
  if (!app) return voltar(base, { erro: "meta_nao_configurado" });

  if (
    !(await supportCallbackWriteAllowed(estado.organizationId, estado.userId, estado.authSessionId))
  ) {
    return voltar(base, { erro: "estado_invalido" });
  }

  const admin = createAdminClient();

  // O callback é público: a identidade vem do `state`. Quem foi rebaixado nos 10
  // minutos de validade não conclui uma troca de token da organização.
  if (!(await aindaEAdminDaOrganizacao(admin, estado.organizationId, estado.userId))) {
    logger.warn("[plataformas-de-anuncio.meta.callback] dono do state não é mais admin", {
      organizationId: estado.organizationId,
    });
    return voltar(base, { erro: "estado_invalido" });
  }

  // O retorno vale UMA vez: o nonce é queimado ANTES da troca, porque o `code`
  // é de uso único. Qualquer erro recusa, não só o `23505`.
  const { error: erroDoNonce } = await admin.from("calendar_oauth_nonces").insert({
    nonce: estado.nonce,
    organization_id: estado.organizationId,
    user_id: estado.userId,
    expira_em: new Date(estado.expiraEmMs).toISOString(),
  });
  if (erroDoNonce) return voltar(base, { erro: "estado_invalido" });

  // 3. Troca, só depois do state confirmado e queimado.
  const agora = new Date();
  const leitura = await obterTokenLongo(app, code, { agora });
  if (!leitura.ok) {
    logger.error("[plataformas-de-anuncio.meta.callback] troca de código falhou", {
      organizationId: estado.organizationId,
      motivo: leitura.motivo,
      detalhe: leitura.detalhe.slice(0, 300),
    });
    return voltar(base, { erro: "troca_falhou" });
  }

  const perfil = await lerPerfilDoToken(leitura.token.access_token);

  // Permissões granulares: a pessoa pode desmarcar `ads_read` na tela da Meta, e a
  // conexão ficaria "conectada" e falhando calada. Lista lida e sem `ads_read` recusa.
  if (perfil.scopes !== null && !perfil.scopes.includes("ads_read")) {
    return voltar(base, { erro: "permissao_negada" });
  }

  // O que havia antes (procedência e dono do token): a troca de um token colado à
  // mão por este fica no registro, e a conta padrão de outro usuário Meta não é
  // mantida às cegas.
  const { data: anterior } = await admin
    .from("ad_insights_connections")
    .select("connected_via, meta_user_id")
    .eq("organization_id", estado.organizationId)
    .eq("platform", "meta_ads")
    .maybeSingle();
  // Zera padrão e lista quando o dono pode ter mudado: id diferente, ou conexão
  // anterior de outra procedência / sem identidade conhecida (não dá para provar
  // que é o mesmo login). Sem conexão anterior não há o que zerar.
  const donoMudou =
    Boolean(anterior) &&
    (anterior?.connected_via !== "oauth" ||
      !anterior?.meta_user_id ||
      !perfil.metaUserId ||
      anterior.meta_user_id !== perfil.metaUserId);

  // 4. Cifra e upsert pelo gravador compartilhado (cifra antes do upsert; sem
  // cifra, recusa). Reconectar com o mesmo login mantém conta padrão e contas permitidas; outro login zera as duas.
  const gravado = await gravarConexaoDeLeitura(admin, {
    organizationId: estado.organizationId,
    userId: estado.userId,
    platform: "meta_ads",
    accessToken: leitura.token.access_token,
    ...(donoMudou ? { defaultAccountId: null, allowedAdAccountIds: null } : {}),
    oauth: {
      expiraEm: leitura.token.expira_em,
      scopes: perfil.scopes,
      metaUserId: perfil.metaUserId,
    },
  });
  if (!gravado.ok) {
    if (gravado.error === "erro_ao_gravar") {
      logger.error("[plataformas-de-anuncio.meta.callback] upsert falhou", {
        organizationId: estado.organizationId,
        detalhe: gravado.detalhe,
      });
    }
    return voltar(base, { erro: gravado.error });
  }

  await audit({
    action: "ad_insights_connection.updated",
    actorUserId: estado.userId,
    organizationId: estado.organizationId,
    resourceType: "ad_insights_connections",
    resourceId: null,
    metadata: {
      platform: "meta_ads",
      via: "oauth",
      token_trocado: true,
      via_anterior: anterior?.connected_via ?? (anterior ? "manual" : null),
      conta_padrao_limpa: donoMudou,
      token_expires_at: leitura.token.expira_em,
    },
  });

  // 5. Identidade e verificação, DEPOIS da gravação: só informam, e nada aqui desfaz a
  // conexão. Só contagens vão para a URL (nunca nome, id ou token).
  const token = leitura.token.access_token;
  let bms = 0;
  try {
    const quem = await lerIdentidadeDoToken(token);
    bms = quem.empresas.length;
    const { error } = await admin
      .from("ad_insights_connections")
      .update({
        meta_user_name: quem.nome,
        meta_businesses: quem.empresas.length > 0 ? quem.empresas : null,
      })
      .eq("organization_id", estado.organizationId)
      .eq("platform", "meta_ads");
    if (error) {
      logger.warn("[plataformas-de-anuncio.meta.callback] identidade não gravada", {
        organizationId: estado.organizationId,
      });
    }
  } catch {
    // a conexão já está gravada
  }
  let desfecho: DesfechoDaVerificacao = { tipo: "aviso", aviso: "leitura_falhou" };
  try {
    desfecho = desfechoDaVerificacao(await listarContas(token), bms);
  } catch {
    // fica em leitura_falhou
  }
  return voltar(base, { conectado: "1", escolher: "1", ...parametrosDoDesfecho(desfecho) });
}
