/**
 * GET /api/v1/plataformas-de-anuncio/meta/connect: começa o "Conectar com Meta"
 * (leitura de anúncios) da organização.
 *
 * Irmã de `.../google/connect/route.ts`: manda o admin ao Login do Facebook com
 * um `state` assinado que carrega a ORGANIZAÇÃO, e grava o cookie de vínculo
 * (restrito ao caminho do callback) que prova, na volta, que o navegador é o que
 * saiu. Piso de papel `admin` (e MFA, pelo `requireRole`), o mesmo da tela de
 * colar o token.
 *
 * Todo desfecho de erro volta para Configurações › Meta Ads com `?erro=<código>`,
 * nunca JSON: este endereço é aberto pelo navegador, num clique de botão.
 */
import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import {
  assinarVinculo,
  NOME_DO_VINCULO,
  VALIDADE_DO_VINCULO_S,
} from "@/lib/agenda/google/vinculo";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { authenticatedSessionId, requireSupportWrite } from "@/lib/impersonate/support";
import {
  CAMINHO_DO_CALLBACK,
  configuracaoDoMetaAds,
} from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { emitirEstado, segredoDoVinculo } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import { montarUrlDeConsentimento } from "@/lib/plataformas-de-anuncio/meta/oauth/oauth";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export const dynamic = "force-dynamic";

function voltarComErro(codigo: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(`/app/settings/meta-ads?erro=${codigo}`, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("admin", { requestId, resource: "ad_insights_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  const app = configuracaoDoMetaAds();
  // Não audita: não houve tentativa de conectar nada.
  if (!app) return voltarComErro("meta_nao_configurado");

  // O nonce nasce aqui porque é usado duas vezes: dentro do `state` e na
  // assinatura do cookie de vínculo, o par que o callback confere.
  const nonce = randomBytes(16).toString("base64url");

  let state: string;
  try {
    state = emitirEstado(
      { organizationId: org.orgId, userId: user.id, authSessionId: await authenticatedSessionId() },
      { segredo: env.INTERNAL_SECRET, agora: new Date(), nonce },
    );
  } catch {
    return voltarComErro("estado_invalido");
  }

  const resposta = NextResponse.redirect(montarUrlDeConsentimento(app, { state }));
  // `lax`: strict não viaja na volta da Meta. `cookieSecure()`: `secure: true`
  // literal perderia o cookie em instalação servida por http.
  resposta.cookies.set(NOME_DO_VINCULO, assinarVinculo(nonce, segredoDoVinculo(env.INTERNAL_SECRET)), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: CAMINHO_DO_CALLBACK,
    maxAge: VALIDADE_DO_VINCULO_S,
  });
  return resposta;
}
