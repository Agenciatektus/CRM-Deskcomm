/**
 * Conectar o Instagram DIRETO pelo CRM, do lado de dentro do seam.
 *
 * O caminho por código continua existindo (`app/api/v1/channels/instagram/route.ts`): aqui o
 * operador não gera código na plataforma, clica em "Conectar com o Instagram", consente na Meta
 * e volta já pareado. O canal que sai daqui é gravado pelo MESMO `saveInstagramSession` do
 * caminho por código, com o mesmo formato (vínculo, token cifrado, caminho e segredo do webhook).
 *
 * ─── Quem é quem ─────────────────────────────────────────────────────────────
 *
 * Organização e usuário vêm SEMPRE da sessão de quem chama (as rotas os resolvem com
 * `requireRole`); nada aqui lê isso de corpo. O `nonce` fica no cookie lacrado
 * (`direto-pedido.ts`) e só o hash dele vai à plataforma.
 *
 * ─── Canal criado por este caminho ───────────────────────────────────────────
 *
 * Ganha `metadata.instagram_direto = true` (sem migration): é o que diz, ao arquivar o canal,
 * que o vínculo é nosso para revogar. Canais criados por código não têm a marca e seguem como
 * estão.
 */
import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  escolherSessaoHospedada,
  listInstagramSessions,
  saveInstagramSession,
} from "@/lib/channels/connect";
import { CHANNEL_PROVIDER_INSTAGRAM } from "@/lib/channels/capabilities";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import {
  concluirPedido,
  desconectarVinculo,
  iniciarPedido,
  instagramDiretoConfigurado,
  type ErroDoPedido,
} from "./direto-verdash";
import {
  VALIDADE_DO_PEDIDO_S,
  abrirPedido,
  hashDoNonce,
  lacrarPedido,
} from "./direto-pedido";

export { instagramDiretoConfigurado };
export {
  CAMINHO_DO_COOKIE_DO_PEDIDO,
  NOME_DO_COOKIE_DO_PEDIDO,
  VALIDADE_DO_PEDIDO_S,
} from "./direto-pedido";

/** Para onde a plataforma devolve o navegador. Ponte pública que repassa à página do app. */
export const CAMINHO_DO_RETORNO = "/api/v1/channels/instagram/retorno";
/** A página autenticada que conclui. */
export const CAMINHO_DA_PAGINA_DE_RETORNO = "/app/connections/instagram/retorno";

function origemPublica(): string | null {
  const configurada = env.NEXT_PUBLIC_APP_URL;
  if (!configurada || configurada.includes("placeholder.invalid")) return null;
  return configurada.replace(/\/+$/, "");
}

/**
 * `env.*` e NÃO `process.env.NEXT_PUBLIC_APP_URL` direto: a imagem genérica é construída com
 * `https://placeholder.invalid`, e `NEXT_PUBLIC_` é substituída no build. Sem fallback para
 * header da requisição: o endereço é persistido e vira entrega recorrente.
 */
export function urlDoWebhookDoCanal(token: string): string | null {
  const origem = origemPublica();
  return origem ? `${origem}/api/v1/webhooks/channel/${token}` : null;
}

/** A `return_url` sai SEMPRE da origem pública do servidor, nunca do corpo. */
export function urlDoRetorno(): string | null {
  const origem = origemPublica();
  return origem ? `${origem}${CAMINHO_DO_RETORNO}` : null;
}

export type Iniciado =
  | { ok: true; authorizeUrl: string; cookie: string }
  | { ok: false; erro: ErroDoPedido | "sem_endereco_publico" };

export async function iniciarInstagramDireto(input: {
  orgId: string;
  userId: string;
  rotulo: string;
}): Promise<Iniciado> {
  if (!instagramDiretoConfigurado()) return { ok: false, erro: "nao_configurado" };
  const retorno = urlDoRetorno();
  const webhookPathToken = randomBytes(16).toString("hex");
  const webhookUrl = urlDoWebhookDoCanal(webhookPathToken);
  if (!retorno || !webhookUrl) return { ok: false, erro: "sem_endereco_publico" };

  const nonce = randomBytes(32).toString("hex");
  const webhookSecret = randomBytes(32).toString("hex");

  const r = await iniciarPedido({
    orgExternaId: input.orgId,
    webhookUrl,
    webhookSecret,
    nonceHash: hashDoNonce(nonce),
    returnUrl: retorno,
    rotulo: input.rotulo,
  });
  if (!r.ok) return r;

  return {
    ok: true,
    authorizeUrl: r.data.authorizeUrl,
    cookie: lacrarPedido({
      pedidoId: r.data.pedidoId,
      nonce,
      userId: input.userId,
      orgId: input.orgId,
      expiraEm: Date.now() + VALIDADE_DO_PEDIDO_S * 1000,
      webhookPathToken,
      webhookSecret,
    }),
  };
}

export type Concluido =
  | {
      ok: true;
      connected: boolean;
      display_name: string;
      status: string;
      recebimento_ligado: boolean;
      recebimento_erro: string | null;
    }
  | {
      ok: false;
      /** `pedido_invalido` cobre cookie ausente, vencido, de outra sessão ou de outro pedido. */
      erro: ErroDoPedido | "cifra_indisponivel" | "conta_em_outra_organizacao" | "falha_ao_gravar";
      /** O cookie já não serve para nada (pedido queimado ou recusado): a rota o apaga. */
      limparCookie: boolean;
    };

/**
 * Fecha o pedido. A plataforma só é chamada com o cookie PROVADO: aberto, dentro da validade,
 * da MESMA organização e do MESMO usuário da sessão atual, e do mesmo `pedido` da requisição.
 * Qualquer divergência dá o mesmo `pedido_invalido`, sem nenhuma chamada à plataforma.
 */
export async function concluirInstagramDireto(
  admin: SupabaseClient,
  input: {
    orgId: string;
    userId: string;
    cookie: string | undefined;
    pedidoId: string;
    conclusao: string;
  },
): Promise<Concluido> {
  const pedido = abrirPedido(input.cookie);
  if (
    !pedido ||
    pedido.userId !== input.userId ||
    pedido.orgId !== input.orgId ||
    pedido.pedidoId !== input.pedidoId
  ) {
    return { ok: false, erro: "pedido_invalido", limparCookie: false };
  }

  // A cifra tem de existir ANTES de queimar o pedido: o token só aparece uma vez, e perdê-lo
  // por falta de chave deixaria o pedido gasto e nada gravado.
  const segredoCifrado = await encryptWebhookSecret(admin, pedido.webhookSecret);
  if (!segredoCifrado) return { ok: false, erro: "cifra_indisponivel", limparCookie: false };

  const r = await concluirPedido({
    pedidoId: pedido.pedidoId,
    nonce: pedido.nonce,
    conclusao: input.conclusao,
  });
  if (!r.ok) {
    // Indisponibilidade transitória mantém o cookie para tentar de novo; o resto é definitivo.
    return { ok: false, erro: r.erro, limparCookie: r.erro !== "indisponivel" };
  }

  const c = r.data;
  const credCifrada = await encryptWebhookSecret(admin, c.token);
  if (!credCifrada) return { ok: false, erro: "cifra_indisponivel", limparCookie: true };

  const sessoes = await listInstagramSessions(admin, pedido.orgId);
  const existente = escolherSessaoHospedada(sessoes, { instanceName: c.instanciaId, phoneNumber: null });
  const nome = c.username ? `@${c.username.replace(/^@/, "")}` : (c.displayName ?? "Instagram");
  const conectado = c.status === "WORKING" || c.status === "connected";

  const { error } = await saveInstagramSession(admin, {
    organizationId: pedido.orgId,
    existingId: existente?.id ?? null,
    instanceName: c.instanciaId,
    vinculoId: c.vinculoId,
    tokenEncrypted: credCifrada,
    webhookPathToken: pedido.webhookPathToken,
    webhookSecretEncrypted: segredoCifrado,
    phoneNumber: null,
    displayName: nome,
    connected: conectado,
  });
  if (error) {
    logger.warn("[instagram-direto] não gravou o canal", {
      organization_id: pedido.orgId,
      vinculo_id: c.vinculoId,
    });
    return {
      ok: false,
      erro: error.includes("channel_sessions_verdash_instance_unique")
        ? "conta_em_outra_organizacao"
        : "falha_ao_gravar",
      limparCookie: true,
    };
  }

  await marcarComoDireto(admin, pedido.orgId, c.instanciaId);

  return {
    ok: true,
    connected: conectado,
    display_name: nome,
    status: conectado ? "WORKING" : "STARTING",
    // O vínculo nasce com o webhook que mandamos; não há segunda ponta manual.
    recebimento_ligado: true,
    recebimento_erro: null,
  };
}

/**
 * A marca no metadata (merge: o resto do metadata, como o pré-go-live, fica). Falhar aqui não
 * desfaz o canal: no pior caso o vínculo não é revogado ao arquivar, e o log diz qual.
 */
async function marcarComoDireto(admin: SupabaseClient, orgId: string, instanceName: string): Promise<void> {
  const { data } = await admin
    .from("channel_sessions")
    .select("id, metadata")
    .eq("organization_id", orgId)
    .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
    .eq("verdash_instance_name", instanceName)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return;
  const metadata = { ...((data.metadata as Record<string, unknown> | null) ?? {}), instagram_direto: true };
  const { error } = await admin
    .from("channel_sessions")
    .update({ metadata })
    .eq("organization_id", orgId)
    .eq("id", data.id as string);
  if (error) logger.warn("[instagram-direto] marca do canal não gravada", { organization_id: orgId });
}

/**
 * Ao arquivar ou excluir um canal criado por este caminho, revoga o vínculo lá. Melhor esforço:
 * nunca lança e nunca trava a exclusão que o admin pediu. Canal de outro caminho: não faz nada.
 */
export async function desconectarInstagramDireto(
  admin: SupabaseClient,
  input: { orgId: string; channelSessionId: string },
): Promise<"revogado" | "falhou" | "nao_se_aplica"> {
  try {
    const { data } = await admin
      .from("channel_sessions")
      .select("verdash_vinculo_id, metadata")
      .eq("organization_id", input.orgId)
      .eq("id", input.channelSessionId)
      .eq("provider", CHANNEL_PROVIDER_INSTAGRAM)
      .maybeSingle();
    const marcado = (data?.metadata as Record<string, unknown> | null)?.instagram_direto === true;
    const vinculoId = data?.verdash_vinculo_id as string | null | undefined;
    if (!marcado || !vinculoId || !instagramDiretoConfigurado()) return "nao_se_aplica";

    const r = await desconectarVinculo({ vinculoId, orgExternaId: input.orgId });
    if (r.ok) return "revogado";
    logger.warn("[instagram-direto] vínculo não revogado na plataforma", {
      organization_id: input.orgId,
      channel_session_id: input.channelSessionId,
      motivo: r.erro,
    });
    return "falhou";
  } catch {
    logger.warn("[instagram-direto] erro ao revogar o vínculo", {
      organization_id: input.orgId,
      channel_session_id: input.channelSessionId,
    });
    return "falhou";
  }
}
