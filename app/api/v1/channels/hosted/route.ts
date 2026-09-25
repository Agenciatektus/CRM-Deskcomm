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
  escolherSessaoHospedada,
  ligarRecebimentoHospedado,
  listHostedSessions,
  numeroHospedadoEmOutraOrganizacao,
  saveHostedSession,
  trocarCodigoHospedado,
  validateHostedToken,
} from "@/lib/channels/connect";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dois caminhos, e o primeiro é o preferido.
 *
 * `codigo` — o cliente gera na plataforma dele e cola aqui. A credencial que
 *   chega é de máquina, com escopo de um número, e quem revoga é a plataforma,
 *   num clique. É o caminho que a tela mostra.
 *
 * `token` — o token da própria linha, colado à mão. Funciona, e foi como o
 *   primeiro número entrou no ar, mas a credencial da linha passa a viver aqui
 *   dentro: cortar o acesso obriga a rotacioná-la lá, derrubando junto o
 *   sistema que já usava aquele número. Fica como alternativa declarada, não
 *   como padrão.
 *
 * Um dos dois, nunca os dois — mandar ambos é sinal de chamador confuso, e
 * escolher por ele esconderia o engano.
 */
const conectarSchema = z
  .object({
    codigo: z.string().trim().min(8).max(32).optional(),
    token: z.string().trim().min(8).max(500).optional(),
  })
  .refine((v) => Boolean(v.codigo) !== Boolean(v.token), {
    message: "informe o código de pareamento OU o token da instância",
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
function urlDoWebhook(req: NextRequest, token: string): string | null {
  const configurada = env.NEXT_PUBLIC_APP_URL;
  const usavel = configurada && !configurada.includes("placeholder.invalid") ? configurada : null;
  // SEM fallback para o header da requisição.
  //
  // A versão anterior caía em `req.headers.get("origin")` quando a variável era
  // o placeholder — que é o caso da imagem genérica de self-host. Como esta URL
  // é PERSISTIDA e vira entrega recorrente, um admin de organização mandando
  // `Origin: https://evil.com` por curl fazia o provedor passar a entregar TODAS
  // as mensagens daquele número, com o segredo do webhook junto, para o host que
  // ele escolheu.
  //
  // Sem a variável configurada, o desfecho honesto é recusar: um canal que
  // conecta apontando para o lugar errado é pior que um canal que não conecta e
  // diz por quê.
  if (!usavel) return null;
  return `${usavel.replace(/\/+$/, "")}/api/v1/webhooks/channel/${token}`;
}

/**
 * A gravação falhou. O caso que a pessoa consegue resolver ganha motivo legível: o
 * número já é canal de OUTRA organização desta instalação (uma instância pertence a
 * um canal só). O resto segue como erro interno.
 */
function falhaAoGravar(
  erro: string,
  t: (texto: string) => string,
  requestId: string,
): NextResponse {
  if (numeroHospedadoEmOutraOrganizacao(erro)) {
    return fail(
      "conflict",
      t(
        "este número já está conectado em outra organização deste CRM — desconecte lá antes de conectar aqui",
      ),
      409,
      { requestId },
    );
  }
  return fail("internal_error", erro, 500, { requestId });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  // Conectar um canal expõe a conta da empresa: é decisão de dono, não de quem
  // atende.
  const authz = await requireRole("admin", { requestId, resource: "channels_hosted" });
  if (!authz.ok) return authz.response;

  const ativas = (await listHostedSessions(createAdminClient(), authz.org.orgId)).filter(
    (s) => !s.archivedAt,
  );
  const sessao = ativas[0] ?? null;
  const conectado = !!sessao;

  return ok(
    {
      label: HOSTED_CHANNEL_LABEL,
      connected: conectado,
      // Todos os números conectados. Os campos soltos abaixo continuam descrevendo o
      // PRIMEIRO, para quem lia esta rota quando só cabia um.
      sessions: ativas.map((s) => ({
        channel_session_id: s.id,
        instance_name: s.instanceName,
        phone_number: s.phoneNumber,
        display_name: s.displayName,
        status: s.status,
        has_token: s.hasToken,
      })),
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
  const admin = createAdminClient();

  // Os canais deste tipo que a organização JÁ tem. Qual deles é o número que está
  // chegando só se sabe depois de validar o token ou trocar o código — decidir antes
  // era o defeito: o segundo número sobrescrevia o primeiro (ver
  // `escolherSessaoHospedada`).
  const sessoes = await listHostedSessions(admin, orgId);

  // O endereço público é pré-condição dos dois caminhos: sem ele nem vale a pena
  // perguntar nada lá fora.
  if (!urlDoWebhook(req, "sonda")) {
    return fail(
      "invalid_request",
      t(
        "esta instalação não sabe o próprio endereço público — configure NEXT_PUBLIC_APP_URL antes de conectar",
      ),
      422,
      { requestId },
    );
  }

  // O segredo que autentica o que ENTRA. Nasce aqui nos dois caminhos: no
  // pareado ele viaja para a plataforma, que o devolve em cada entrega; no
  // direto, o próprio CRM o registra no servidor de WhatsApp.
  const segredoWebhook = randomBytes(32).toString("hex");
  const segredoCifrado = await encryptWebhookSecret(admin, segredoWebhook);

  // ── Caminho 1: código de pareamento ──────────────────────────────────────
  //
  // Quem valida é a plataforma do cliente: ela conhece o código, sabe de qual
  // número ele é, e é dela a decisão de autorizar. O CRM não vê token de linha
  // nenhum — recebe uma credencial que só serve para pedir envio daquele
  // número, e que morre quando alguém revogar lá.
  if (parsed.data.codigo) {
    // Token de caminho NOVO: o número só é conhecido depois da troca, e a troca já
    // precisa do endereço. Se for a reconexão de um número que já está aqui, a linha
    // dele é atualizada e passa a este endereço — o antigo deixa de corresponder a
    // canal nenhum, em vez de continuar entregando num canal que não é o dele.
    const pathTokenPareado = randomBytes(16).toString("hex");
    const webhookUrl = urlDoWebhook(req, pathTokenPareado) as string;
    const troca = await trocarCodigoHospedado({
      codigo: parsed.data.codigo,
      webhookUrl,
      segredo: segredoWebhook,
      rotulo: authz.org.name ?? "CRM",
    });
    if (!troca.ok) return fail("invalid_request", t(troca.reason), 422, { requestId });

    const credCifrada = await encryptWebhookSecret(admin, troca.token);
    if (!credCifrada || !segredoCifrado) {
      return fail(
        "invalid_request",
        t("cifra indisponível nesta instalação — a credencial não foi gravada"),
        422,
        { requestId },
      );
    }

    const existentePareado = escolherSessaoHospedada(sessoes, {
      instanceName: troca.instanceName,
      phoneNumber: troca.phoneNumber,
    });
    const { error: erroPareado } = await saveHostedSession(admin, {
      organizationId: orgId,
      existingId: existentePareado?.id ?? null,
      instanceName: troca.instanceName,
      vinculoId: troca.vinculoId,
      tokenEncrypted: credCifrada,
      webhookPathToken: pathTokenPareado,
      webhookSecretEncrypted: segredoCifrado,
      phoneNumber: troca.phoneNumber,
      displayName: troca.displayName,
      connected: troca.connected,
    });
    if (erroPareado) return falhaAoGravar(erroPareado, t, requestId);

    return ok(
      {
        connected: true,
        modo: "pareado",
        instance_name: troca.instanceName,
        phone_number: troca.phoneNumber,
        display_name: troca.displayName,
        status: troca.connected ? "WORKING" : "STARTING",
        webhook_url: webhookUrl,
        recebimento_ligado: troca.recebimentoLigado,
        recebimento_erro: troca.recebimentoAviso,
      },
      { requestId },
    );
  }

  // ── Caminho 2: token da instância, colado à mão ──────────────────────────
  const token = parsed.data.token as string;

  // Valida ANTES de gravar: gravar primeiro e descobrir depois é o que faz o
  // operador achar que conectou e só entender que não na primeira mensagem que
  // não sai, com o cliente do outro lado esperando.
  //
  // O nome da instância vem da RESPOSTA, não do formulário — ver
  // `validateHostedToken`.
  const v = await validateHostedToken(token);
  if (!v.ok) return fail("invalid_request", t(v.reason), 422, { requestId });

  const tokenCifrado = await encryptWebhookSecret(admin, token);
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

  // Este número já é um canal daqui? Então é reconexão: mesma linha, mesmo endereço
  // (o webhook que já está lá continua valendo). Senão, canal novo com endereço novo.
  // Reconectar por cima de um canal excluído RESSUSCITA a linha.
  const existente = escolherSessaoHospedada(sessoes, {
    instanceName: v.instanceName,
    phoneNumber: v.phoneNumber,
  });
  const pathToken = existente?.webhookPathToken ?? randomBytes(16).toString("hex");
  const webhookUrl = urlDoWebhook(req, pathToken) as string;

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
  if (error) return falhaAoGravar(error, t, requestId);

  // A volta, por último e de propósito: se o registro falhar, o canal já está
  // gravado e ENVIA — e a tela diz, com todas as letras, que a entrada não foi
  // ligada. Falhar a requisição inteira aqui desfaria uma conexão que funciona
  // pela metade em uma que não funciona nada, e ainda deixaria o operador sem
  // saber qual das duas pontas quebrou.
  const volta = await ligarRecebimentoHospedado({ token, webhookUrl, segredo: segredoWebhook });

  return ok(
    {
      connected: true,
      modo: "direto",
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
