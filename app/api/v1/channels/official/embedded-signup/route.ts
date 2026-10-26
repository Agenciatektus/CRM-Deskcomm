import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/channels/official/embedded-signup — conclui o "Conectar com a Meta".
 *
 * O popup da Meta devolve ao navegador um `code` de uso único e os ids da conta e do número.
 * Aqui o servidor troca o code por token, confere que o token é deste app e tem o escopo do
 * WhatsApp, confere que o número pertence à conta, registra o número (menos em Coexistence,
 * onde o número continua no app WhatsApp Business) e grava pelo MESMO caminho de quem cola
 * as credenciais (`gravarCanalOficial`), webhook incluído.
 *
 * A organização vem SEMPRE da sessão: nada do corpo decide de quem é o canal.
 * O `code` e o token não vão para log nem para resposta.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { appDaMeta } from "@/lib/channels/meta/app";
import {
  conferirTokenDeNegocio,
  embeddedSignupConfigurado,
  registrarNumero,
  trocarCodePorToken,
} from "@/lib/channels/meta/embedded-signup";
import { checarGravacaoLocal, gravarCanalOficial } from "@/lib/channels/meta/gravar-canal-oficial";
import { validateMetaCredentials } from "@/lib/channels/meta/validate-credentials";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { basePublicaDoWebhookMeta } from "@/lib/webhooks/url-publica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpoSchema = z.object({
  code: z.string().trim().min(1).max(2048),
  waba_id: z.string().regex(/^\d{5,25}$/),
  phone_number_id: z.string().regex(/^\d{5,25}$/),
  coexistencia: z.boolean(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_official" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("A Meta não retornou os dados do número. Refaça e conclua todos os passos."), 422, { requestId });
  }
  const { code, waba_id, phone_number_id, coexistencia } = parsed.data;

  const config = embeddedSignupConfigurado();
  const { appSecret } = await appDaMeta();
  if (!config || !appSecret) {
    return fail("invalid_request", t("A conexão pela Meta não está configurada nesta instalação."), 422, { requestId });
  }

  // Antes de qualquer chamada que mude estado na Meta: cifra e plano.
  const admin = createAdminClient();
  const local = await checarGravacaoLocal({ admin, orgId: authz.org.orgId, idioma: authz.user.idioma, t });
  if (local) return fail(local.code, local.message, local.status, { requestId, details: local.details });

  const troca = await trocarCodePorToken({ code, appId: config.appId, appSecret });
  if (!troca.ok) {
    return fail(
      "invalid_request",
      troca.motivo === "code_invalido"
        ? t("O código da Meta expirou ou já foi usado. Refaça a conexão.")
        : t("Não foi possível falar com a Meta agora. Tente de novo em instantes."),
      422,
      { requestId },
    );
  }
  const token = troca.token;

  const escopo = await conferirTokenDeNegocio({ token, appId: config.appId, appSecret, wabaId: waba_id });
  if (!escopo.ok) {
    return fail("invalid_request", t("A Meta não liberou o acesso ao WhatsApp para este app. Refaça e aceite todas as permissões."), 422, { requestId });
  }

  const validacao = await validateMetaCredentials({ phoneNumberId: phone_number_id, token, wabaId: waba_id });
  if (!validacao.ok) {
    return fail("invalid_request", validacao.motivo, 422, { requestId });
  }

  if (!coexistencia) {
    const registro = await registrarNumero({ phoneNumberId: phone_number_id, token });
    if (!registro.ok) {
      return fail(
        "invalid_request",
        registro.motivo === "numero_em_outra_conta"
          ? t("Este número já está ligado a outra conta da Meta. Remova-o de lá e refaça a conexão.")
          : t("A Meta não registrou o número. Refaça a conexão."),
        422,
        { requestId },
      );
    }
  }

  const gravado = await gravarCanalOficial({
    admin,
    orgId: authz.org.orgId,
    userId: authz.user.id,
    requestId,
    idioma: authz.user.idioma,
    t,
    phoneNumberId: phone_number_id,
    wabaId: waba_id,
    token,
    displayPhoneNumber: validacao.displayPhoneNumber,
    verifiedName: validacao.verifiedName,
    base: basePublicaDoWebhookMeta(req),
    coexistencia,
  });
  if (!gravado.ok) {
    return fail(gravado.code, gravado.message, gravado.status, { requestId, details: gravado.details });
  }

  return ok({
    connected: true,
    displayName: gravado.displayName,
    phoneNumber: gravado.phoneNumber,
    coexistencia,
    webhookRegistro: gravado.webhook
      ? { registrado: gravado.webhook.registrado, url: gravado.webhook.url, erro: gravado.webhook.erro, em: gravado.webhook.em }
      : null,
  });
}
