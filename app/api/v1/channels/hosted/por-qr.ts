/**
 * POST /api/v1/channels/hosted com `modo:"qr"`: o CRM cria a conexao e a tela
 * mostra o QR (Fatia 3 do plano FZAP nativo). Mora num arquivo a parte para a
 * rota nao crescer, e o caminho por codigo/token nao muda uma linha.
 *
 * A organizacao vem de quem chama (sessao autenticada), nunca do corpo. A chave
 * de idempotencia e obrigatoria: duplo clique com a mesma chave devolve o mesmo
 * canal em vez de criar uma segunda instancia.
 */
import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { conectarHospedadoPorQr, resumoDoErroHospedado } from "@/lib/channels/connect";
import { traduzirLimiteDoPlano } from "@/lib/cobranca/limites";
import type { Idioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const porQrSchema = z.object({
  modo: z.literal("qr"),
  rotulo: z.string().trim().min(1).max(60),
});

export async function conectarPorQr(i: {
  corpo: unknown;
  idempotencyKey: string | null;
  requestId: string;
  orgId: string;
  orgName: string | null;
  idioma: Idioma;
  t: (texto: string) => string;
  urlDoWebhook: (token: string) => string | null;
}): Promise<NextResponse> {
  const { t, requestId } = i;
  const parsed = porQrSchema.safeParse(i.corpo);
  if (!parsed.success) {
    return fail("invalid_request", t("informe um nome para identificar o número"), 422, { requestId });
  }
  if (!z.string().uuid().safeParse(i.idempotencyKey ?? "").success) {
    return fail("idempotency_key_required", t("a requisição precisa de uma chave de idempotência"), 422, { requestId });
  }
  if (!i.urlDoWebhook("sonda")) {
    return fail(
      "invalid_request",
      t("esta instalação não sabe o próprio endereço público — configure NEXT_PUBLIC_APP_URL antes de conectar"),
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const webhookPathToken = randomBytes(16).toString("hex");
  const segredo = randomBytes(32).toString("hex");
  const segredoCifrado = await encryptWebhookSecret(admin, segredo);
  if (!segredoCifrado) {
    return fail("invalid_request", t("cifra indisponível nesta instalação — a credencial não foi gravada"), 422, { requestId });
  }

  const webhookUrl = i.urlDoWebhook(webhookPathToken) as string;
  const r = await conectarHospedadoPorQr(admin, {
    organizationId: i.orgId,
    orgSlug: i.orgName ?? "org",
    rotulo: parsed.data.rotulo,
    idempotencyKey: i.idempotencyKey as string,
    webhookPathToken,
    webhookUrl,
    segredo,
    segredoCifrado,
  });

  if (!r.ok) {
    if (r.code === "nao_habilitado") {
      return fail("forbidden", t("a conexão por QR code não está habilitada para esta organização"), 403, { requestId });
    }
    if (r.code === "em_andamento") {
      return fail("connection_in_progress", t("A conexão ainda está sendo preparada. Aguarde e tente novamente."), 409, { requestId });
    }
    const limite = traduzirLimiteDoPlano(r.erro, i.idioma);
    if (limite) return fail(limite.code, limite.message, 409, { requestId, details: limite.details });
    // Mensagem fixa: o erro do FZAP pode ecoar proxy e credencial, so o codigo sai no log.
    logger.error("hosted_qr_falhou", { organization_id: i.orgId, erro: resumoDoErroHospedado(r.erro) });
    return fail("connection_repair_required", t("Não foi possível criar a conexão. Tente novamente."), 502, { requestId });
  }

  return ok(
    {
      connected: false,
      modo: "qr",
      channel_session_id: r.channelSessionId,
      instance_name: r.instanceName,
      display_name: r.displayName,
      status: "STARTING",
      webhook_url: r.replay ? null : webhookUrl,
      recebimento_ligado: r.recebimentoLigado,
      recebimento_erro: r.recebimentoErro,
    },
    { requestId, status: r.replay ? 200 : 201 },
  );
}
