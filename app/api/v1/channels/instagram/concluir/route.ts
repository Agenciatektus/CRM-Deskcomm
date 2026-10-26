/**
 * POST /api/v1/channels/instagram/concluir: fecha o "Conectar com o Instagram" e grava o canal.
 *
 * Corpo: `{ pedido_id, conclusao }`. A `conclusao` veio do FRAGMENTO da URL de retorno, lida só
 * por JavaScript na página. O `nonce` NÃO vem do navegador: está no cookie lacrado de
 * `iniciar`. O servidor só conclui se a sessão atual (usuário e organização, ambos da sessão)
 * for a do cookie E o `pedido_id` for o do cookie; qualquer divergência dá o MESMO erro
 * genérico, sem chamada à plataforma.
 *
 * Nada sensível sai daqui: nem nonce, nem conclusão, nem token, nem segredo de webhook.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import {
  CAMINHO_DO_COOKIE_DO_PEDIDO,
  NOME_DO_COOKIE_DO_PEDIDO,
  concluirInstagramDireto,
  instagramDiretoConfigurado,
} from "@/lib/channels/instagram/direto";
import { mensagemDoErro, statusDoErro } from "@/lib/channels/instagram/direto-mensagens";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpoSchema = z
  .object({
    pedido_id: z.string().uuid(),
    conclusao: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

function semCookie(res: NextResponse): NextResponse {
  res.cookies.set(NOME_DO_COOKIE_DO_PEDIDO, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: CAMINHO_DO_COOKIE_DO_PEDIDO,
    maxAge: 0,
  });
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // Corpo mal formado dá o mesmo erro genérico de pedido que não confere.
  const generico = () =>
    fail("pedido_invalido", mensagemDoErro("pedido_invalido", t), statusDoErro("pedido_invalido"), { requestId });
  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return generico();

  const r = await concluirInstagramDireto(createAdminClient(), {
    orgId: authz.org.orgId,
    userId: authz.user.id,
    cookie: req.cookies.get(NOME_DO_COOKIE_DO_PEDIDO)?.value,
    pedidoId: parsed.data.pedido_id,
    conclusao: parsed.data.conclusao,
  });

  if (!r.ok) {
    const res = fail(r.erro, mensagemDoErro(r.erro, t), statusDoErro(r.erro), { requestId });
    return r.limparCookie ? semCookie(res) : res;
  }

  return semCookie(
    ok(
      {
        connected: r.connected,
        display_name: r.display_name,
        status: r.status,
        recebimento_ligado: r.recebimento_ligado,
        recebimento_erro: r.recebimento_erro,
      },
      { requestId },
    ) as NextResponse,
  );
}
