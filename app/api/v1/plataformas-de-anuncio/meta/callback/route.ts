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
 * `?conectado=1` ou `?erro=<código>`, nunca JSON. Nada de token, segredo ou
 * código vai para log ou para a URL de volta.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NOME_DO_VINCULO, vinculoConfere } from "@/lib/agenda/google/vinculo";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { supportCallbackWriteAllowed } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { gravarConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura";
import {
  CAMINHO_DO_CALLBACK,
  configuracaoDoMetaAds,
} from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { verificarEstado } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import { ESCOPOS_DA_META } from "@/lib/plataformas-de-anuncio/meta/oauth/oauth";
import { lerPerfilDoToken, obterTokenLongo } from "@/lib/plataformas-de-anuncio/meta/oauth/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export const dynamic = "force-dynamic";

function voltar(base: string, params: Record<string, string>): NextResponse {
  const url = new URL("/app/settings/meta-ads", base || "http://localhost:3000");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resposta = NextResponse.redirect(url);
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
  if (!vinculoConfere(req.cookies.get(NOME_DO_VINCULO)?.value, estado.nonce, env.INTERNAL_SECRET)) {
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

  const perfil = await lerPerfilDoToken(leitura.token.access_token, ESCOPOS_DA_META);

  // 4. Cifra e upsert pelo gravador compartilhado (cifra antes do upsert; sem
  // cifra, recusa). Não mexe na conta padrão: reconectar a mantém.
  const gravado = await gravarConexaoDeLeitura(admin, {
    organizationId: estado.organizationId,
    userId: estado.userId,
    platform: "meta_ads",
    accessToken: leitura.token.access_token,
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
      token_expires_at: leitura.token.expira_em,
    },
  });

  return voltar(base, { conectado: "1" });
}
