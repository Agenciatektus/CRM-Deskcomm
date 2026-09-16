import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/channels/hosted — estado da conexão com o número já hospedado.
 * POST /api/v1/channels/hosted — VALIDA o token, grava, e liga a volta sozinho.
 *
 * ─── "hosted", e não a marca, no caminho ────────────────────────────────────
 *
 * O caminho não cita o canal, e o corpo desta rota também não: quem é o
 * provedor, como se chamam as colunas dele e como se valida o token ficam atrás
 * da fachada neutra de `lib/channels/connect`, que é onde nomeá-lo é permitido.
 * O `lint:channels` cobra isso — e cobra na prosa também, porque o regex dele
 * não distingue comentário de código (limitação assumida no próprio script).
 * A razão é anterior ao lint: no dia em que houver um segundo canal deste tipo,
 * esta rota não muda.
 *
 * O que "hospedado" quer dizer: a conexão de WhatsApp NÃO é mantida por este
 * CRM. Ela já existe, viva, em outro sistema do cliente; aqui a gente se
 * pendura nela. É a diferença de natureza que separa este canal do que pareia
 * por QR (onde a conexão é nossa) e do oficial (onde a conexão é da Meta).
 *
 * ─── Por que não existe "passo 2" aqui ──────────────────────────────────────
 *
 * Nos outros canais por credencial, depois de conectar o operador precisa
 * copiar uma URL e um segredo e ir colar no painel do outro sistema. É o passo
 * em que a conexão mais falha, e falha em silêncio: o canal envia e nunca
 * recebe, e nada na tela diz por quê.
 *
 * O token daqui autoriza também a API de webhooks do provedor, então o CRM
 * registra a volta sozinho — de forma ADITIVA, sem derrubar o webhook que o
 * cliente já tinha. O operador cola uma coisa só.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  HOSTED_CHANNEL_LABEL,
  findHostedSession,
  ligarRecebimentoHospedado,
  saveHostedSession,
  validateHostedToken,
} from "@/lib/channels/connect";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const conectarSchema = z.object({
  token: z.string().trim().min(8).max(500),
});

/**
 * Endereço público desta instalação — é para cá que o provedor vai entregar.
 *
 * `env.*` e NÃO `process.env.NEXT_PUBLIC_APP_URL` direto: variáveis
 * `NEXT_PUBLIC_` são substituídas no BUILD, e a imagem genérica do self-host é
 * construída com `https://placeholder.invalid`. Lido do `process.env`, o
 * webhook seria registrado apontando para o nada — e, pior que no canal manual,
 * aqui ninguém veria a URL errada, porque quem a cola é o próprio CRM.
 */
function urlDoWebhook(req: NextRequest, token: string): string {
  const configurada = env.NEXT_PUBLIC_APP_URL;
  const usavel = configurada && !configurada.includes("placeholder.invalid") ? configurada : null;
  const base = (
    usavel ??
    req.headers.get("origin") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`
  ).replace(/\/+$/, "");
  return `${base}/api/v1/webhooks/channel/${token}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  // Conectar um canal expõe a conta da empresa: é decisão de dono, não de quem
  // atende.
  const authz = await requireRole("admin", { requestId, resource: "channels_hosted" });
  if (!authz.ok) return authz.response;

  const sessao = await findHostedSession(createAdminClient(), authz.org.orgId);
  const conectado = !!sessao && !sessao.archivedAt;

  return ok(
    {
      label: HOSTED_CHANNEL_LABEL,
      connected: conectado,
      channel_session_id: conectado ? sessao.id : null,
      instance_name: conectado ? sessao.instanceName : null,
      phone_number: conectado ? sessao.phoneNumber : null,
      display_name: conectado ? sessao.displayName : null,
      status: conectado ? sessao.status : null,
      // Existe, não qual é. O token nunca volta num GET.
      has_token: conectado ? sessao.hasToken : false,
      webhook_url:
        conectado && sessao.webhookPathToken ? urlDoWebhook(req, sessao.webhookPathToken) : null,
    },
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_hosted" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const parsed = conectarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("o token da instância é obrigatório"), 422, { requestId });
  }
  const token = parsed.data.token;

  // Valida ANTES de gravar: gravar primeiro e descobrir depois é o que faz o
  // operador achar que conectou e só entender que não na primeira mensagem que
  // não sai, com o cliente do outro lado esperando.
  //
  // O nome da instância vem da RESPOSTA, não do formulário — ver
  // `validateHostedToken`.
  const v = await validateHostedToken(token);
  if (!v.ok) return fail("invalid_request", t(v.reason), 422, { requestId });

  const admin = createAdminClient();
  const tokenCifrado = await encryptWebhookSecret(admin, token);
  // Segredo do webhook: é o que autentica o que ENTRA. Aqui ele nunca é
  // mostrado ao operador, porque quem o cola do outro lado é o próprio CRM.
  const segredoWebhook = randomBytes(32).toString("hex");
  const segredoCifrado = await encryptWebhookSecret(admin, segredoWebhook);

  if (!tokenCifrado || !segredoCifrado) {
    // Sem a GUC de cifra, gravar o token em claro seria pior que recusar — e
    // este token abre o WhatsApp do cliente.
    return fail(
      "invalid_request",
      t("cifra indisponível nesta instalação — o token não foi gravado"),
      422,
      { requestId },
    );
  }

  const existente = await findHostedSession(admin, orgId);
  // Reconectar por cima de um canal excluído RESSUSCITA a linha, e o token de
  // caminho é preservado para não invalidar o webhook já registrado lá.
  const pathToken = existente?.webhookPathToken ?? randomBytes(16).toString("hex");
  const webhookUrl = urlDoWebhook(req, pathToken);

  const { error } = await saveHostedSession(admin, {
    organizationId: orgId,
    existingId: existente?.id ?? null,
    instanceName: v.instanceName,
    tokenEncrypted: tokenCifrado,
    webhookPathToken: pathToken,
    webhookSecretEncrypted: segredoCifrado,
    phoneNumber: v.phoneNumber,
    displayName: v.displayName,
    connected: v.connected,
  });
  if (error) return fail("internal_error", error, 500, { requestId });

  // A volta, por último e de propósito: se o registro falhar, o canal já está
  // gravado e ENVIA — e a tela diz, com todas as letras, que a entrada não foi
  // ligada. Falhar a requisição inteira aqui desfaria uma conexão que funciona
  // pela metade em uma que não funciona nada, e ainda deixaria o operador sem
  // saber qual das duas pontas quebrou.
  const volta = await ligarRecebimentoHospedado({ token, webhookUrl, segredo: segredoWebhook });

  return ok(
    {
      connected: true,
      instance_name: v.instanceName,
      phone_number: v.phoneNumber,
      display_name: v.displayName,
      status: v.connected ? "WORKING" : "STARTING",
      webhook_url: webhookUrl,
      /** A entrada foi ligada? `false` = o canal envia mas não recebe. */
      recebimento_ligado: volta.ok,
      recebimento_erro: volta.ok ? null : (volta.reason ?? null),
    },
    { requestId },
  );
}
