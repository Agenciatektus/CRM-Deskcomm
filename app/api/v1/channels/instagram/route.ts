import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/channels/instagram — estado da conexão do Instagram.
 * POST /api/v1/channels/instagram — troca o código de pareamento e grava.
 *
 * ─── Um campo só, e por que não há um segundo caminho ───────────────────────
 *
 * O canal hospedado de WhatsApp aceita dois caminhos: o código de pareamento e,
 * como alternativa declarada, o token da própria linha colado à mão. Aqui só
 * existe o primeiro — não por simplificação, mas porque não há equivalente: a
 * credencial do Instagram é um token OAuth da Meta, com validade curta e
 * renovação própria, e mantê-lo vivo é trabalho de quem fez o OAuth. Oferecer
 * um campo para colá-lo seria oferecer uma conexão que apaga sozinha em
 * semanas, sem a tela saber dizer por quê.
 *
 * ─── O que este CRM NÃO faz ─────────────────────────────────────────────────
 *
 * Não fala com a Meta. Não guarda token de Meta, não assina webhook de Meta,
 * não depende de App Review de Meta. Quem faz o OAuth é a plataforma do
 * cliente; aqui a gente se pendura no vínculo que ela emitiu, exatamente como
 * no canal hospedado.
 *
 * A consequência prática é a que importa para quem opera: o mesmo código de
 * pareamento que liga o WhatsApp liga o Instagram, porque o vínculo é por
 * INSTÂNCIA. O que muda é qual canal aquele vínculo cobre — e é por isso que
 * `saveInstagramSession` existe em vez de um booleano na chamada do outro.
 *
 * ─── "instagram" no caminho, e o transporte fora dele ───────────────────────
 *
 * A doutrina de restrição de canal proíbe a rota saber QUEM ENTREGA, não a que
 * REDE o cliente está conectando. Quem atende precisa ler "Instagram" para
 * saber o que ligou; se a entrega passa por um provedor ou por outro é decisão
 * de infraestrutura, e trocá-la não pode obrigar a mexer aqui. Por isso o nome
 * do transporte não aparece neste arquivo — ele mora atrás de
 * `lib/channels/connect`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import {
  INSTAGRAM_CHANNEL_LABEL,
  findInstagramSession,
  saveInstagramSession,
  trocarCodigoHospedado,
} from "@/lib/channels/connect";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const conectarSchema = z
  .object({
    codigo: z.string().trim().min(8).max(32),
  })
  .strict();

/**
 * Endereço público desta instalação — é para cá que a entrega vem.
 *
 * `env.*` e NÃO `process.env.NEXT_PUBLIC_APP_URL` direto: variáveis
 * `NEXT_PUBLIC_` são substituídas no BUILD, e a imagem genérica do self-host é
 * construída com `https://placeholder.invalid`.
 *
 * SEM fallback para o header da requisição, pelo mesmo motivo do canal
 * hospedado: esta URL é PERSISTIDA e vira entrega recorrente, então um admin
 * mandando `Origin: https://evil.com` por curl passaria a receber as mensagens
 * daquela conta com o segredo do webhook junto. Sem a variável configurada, o
 * desfecho honesto é recusar.
 */
function urlDoWebhook(token: string): string | null {
  const configurada = env.NEXT_PUBLIC_APP_URL;
  const usavel = configurada && !configurada.includes("placeholder.invalid") ? configurada : null;
  if (!usavel) return null;
  return `${usavel.replace(/\/+$/, "")}/api/v1/webhooks/channel/${token}`;
}

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  // Conectar um canal expõe a conta da empresa: é decisão de dono, não de quem
  // atende.
  const authz = await requireRole("admin", { requestId, resource: "channels_instagram" });
  if (!authz.ok) return authz.response;

  const sessao = await findInstagramSession(createAdminClient(), authz.org.orgId);
  const conectado = !!sessao && !sessao.archivedAt;

  return ok(
    {
      label: INSTAGRAM_CHANNEL_LABEL,
      connected: conectado,
      channel_session_id: conectado ? sessao.id : null,
      // O @ da conta, que é como o operador confere se ligou a certa.
      display_name: conectado ? sessao.displayName : null,
      status: conectado ? sessao.status : null,
      // Existe, não qual é. A credencial nunca volta num GET.
      has_token: conectado ? sessao.hasToken : false,
      webhook_url: conectado && sessao.webhookPathToken ? urlDoWebhook(sessao.webhookPathToken) : null,
    },
    { requestId },
  );
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

  const parsed = conectarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("informe o código de conexão"), 422, { requestId });
  }

  const admin = createAdminClient();
  const orgId = authz.org.orgId;

  const existenteAntes = await findInstagramSession(admin, orgId);
  // Reconectar por cima de um canal excluído RESSUSCITA a linha, e o token de
  // caminho é preservado para não invalidar a entrega já registrada lá.
  const pathToken = existenteAntes?.webhookPathToken ?? randomBytes(16).toString("hex");
  const webhookUrl = urlDoWebhook(pathToken);
  if (!webhookUrl) {
    return fail(
      "invalid_request",
      t(
        "esta instalação não sabe o próprio endereço público — configure NEXT_PUBLIC_APP_URL antes de conectar",
      ),
      422,
      { requestId },
    );
  }

  // O segredo que autentica o que ENTRA. Nasce aqui, viaja para a plataforma no
  // corpo da troca, e volta em cada entrega como prova de que quem entrega é
  // quem foi autorizado.
  const segredoWebhook = randomBytes(32).toString("hex");
  const segredoCifrado = await encryptWebhookSecret(admin, segredoWebhook);

  const troca = await trocarCodigoHospedado({
    codigo: parsed.data.codigo,
    webhookUrl,
    segredo: segredoWebhook,
    rotulo: authz.org.name ?? "CRM",
  });
  if (!troca.ok) return fail("invalid_request", t(troca.reason), 422, { requestId });

  const credCifrada = await encryptWebhookSecret(admin, troca.token);
  if (!credCifrada || !segredoCifrado) {
    // Sem a GUC de cifra, gravar a credencial em claro seria pior que recusar.
    return fail(
      "invalid_request",
      t("cifra indisponível nesta instalação — a credencial não foi gravada"),
      422,
      { requestId },
    );
  }

  const { error } = await saveInstagramSession(admin, {
    organizationId: orgId,
    existingId: existenteAntes?.id ?? null,
    instanceName: troca.instanceName,
    vinculoId: troca.vinculoId,
    tokenEncrypted: credCifrada,
    webhookPathToken: pathToken,
    webhookSecretEncrypted: segredoCifrado,
    phoneNumber: null,
    displayName: troca.displayName,
    connected: troca.connected,
  });
  if (error) return fail("internal_error", error, 500, { requestId });

  return ok(
    {
      connected: true,
      display_name: troca.displayName,
      status: troca.connected ? "WORKING" : "STARTING",
      webhook_url: webhookUrl,
      /** A entrada foi ligada? `false` = o canal não recebe, e a tela diz. */
      recebimento_ligado: troca.recebimentoLigado,
      recebimento_erro: troca.recebimentoAviso,
    },
    { requestId },
  );
}
