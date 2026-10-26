/**
 * POST /api/v1/channels/instagram/iniciar: começa o "Conectar com o Instagram".
 *
 * Devolve SÓ `{ authorize_url }`. A organização e o usuário saem da sessão (admin + MFA, como a
 * rota por código), nunca do corpo: o corpo nem é lido. O `nonce` do pedido nasce aqui e fica
 * no cookie lacrado (`lib/channels/instagram/direto-pedido.ts`); ao navegador vai só a URL.
 *
 * Sem o segredo do parceiro configurado a opção não existe: 404, e a tela já não a mostra.
 */
import { randomUUID } from "node:crypto";

import type { NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import {
  CAMINHO_DO_COOKIE_DO_PEDIDO,
  NOME_DO_COOKIE_DO_PEDIDO,
  VALIDADE_DO_PEDIDO_S,
  iniciarInstagramDireto,
  instagramDiretoConfigurado,
} from "@/lib/channels/instagram/direto";
import { mensagemDoErro, statusDoErro } from "@/lib/channels/instagram/direto-mensagens";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_instagram" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  if (await mfaEmDivida()) {
    return fail("mfa_required", t("Confirme a verificação em duas etapas."), 403, { requestId });
  }
  if (!instagramDiretoConfigurado()) {
    return fail("not_found", t("Recurso não disponível."), 404, { requestId });
  }

  const r = await iniciarInstagramDireto({
    orgId: authz.org.orgId,
    userId: authz.user.id,
    rotulo: authz.org.name ?? "CRM",
  });
  if (!r.ok) return fail(r.erro, mensagemDoErro(r.erro, t), statusDoErro(r.erro), { requestId });

  const resposta = ok({ authorize_url: r.authorizeUrl }, { requestId }) as NextResponse;
  // `lax`: o cookie só precisa viajar na chamada de concluir, feita pela nossa própria página.
  resposta.cookies.set(NOME_DO_COOKIE_DO_PEDIDO, r.cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: CAMINHO_DO_COOKIE_DO_PEDIDO,
    maxAge: VALIDADE_DO_PEDIDO_S,
  });
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
