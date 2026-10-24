/**
 * Verdash NATIVO, passo de ROTA (Fatia 3): "Conectar por QR".
 *
 * Costura o que a Fatia 2 entrega (`nativo.ts`: criar, apagar, QR, status) com a
 * linha do canal em `channel_sessions`. A org vem sempre de quem chama (sessao),
 * nunca do corpo.
 *
 * ─── Reserva idempotente, no molde do WAHA, sem migration ───────────────────
 *
 * `fn_reserve_channel_connection` cria linha de OUTRO provider, entao nao serve.
 * O mesmo efeito vem do proprio banco: o id do canal e derivado de
 * (organizacao, Idempotency-Key) e a linha e INSERIDA ANTES de falar com o FZAP.
 * O segundo clique tenta o mesmo id, bate na chave primaria (23505) e nao cria
 * nada la fora. A linha de reserva nasce ARQUIVADA, com nome provisorio: assim o
 * vigia, as listas e o indice unico de instancia nao a enxergam. Ao final, a
 * gravacao final a desarquiva com os dados reais; em falha, ela e apagada.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { logger } from "@/lib/logger";

import { fzapRequest } from "./client";
import { saveVerdashSession, registrarWebhookNaVerdash } from "./conectar";
import { verdashBaseUrl } from "./credentials";
import type { VerdashCredentials } from "./credentials";
import { apagarNativo, criarInstanciaNativa } from "./nativo";
import type { InstanciaNativa } from "./nativo";

const PREFIXO_RESERVA = "crm-reserva-";

/** Historico desligado: o CRM e a fonte das conversas (FZAP >= v1.35 nasce com 90 dias). */
const HISTORICO_DESLIGADO = { enabled: false, contacts: false, groups: false, retentionDays: 7 };

export type ResultadoNativo =
  | {
      ok: true;
      replay: boolean;
      channelSessionId: string;
      instanceName: string;
      displayName: string;
      recebimentoLigado: boolean;
      recebimentoErro: string | null;
    }
  | { ok: false; code: "nao_habilitado" | "em_andamento" | "falha"; erro?: unknown };

/** uuid estavel por (organizacao, chave): o mesmo clique da o mesmo id, orgs diferentes nunca colidem. */
export function idDoCanalNativo(organizationId: string, idempotencyKey: string): string {
  const h = createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** A org tem pasta no FZAP? Sem expor pasta nem token. Erro de banco = nao habilitado. */
export async function nativoHabilitadoParaOrg(
  admin: SupabaseClient,
  organizationId: string,
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("verdash_fzap_pastas")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** A instancia desta sessao foi criada pelo CRM? Erro/coluna ausente = false (vinculada). */
export async function sessaoEhNativa(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("channel_sessions")
      .select("verdash_origem")
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null)
      .maybeSingle();
    return (data as { verdash_origem?: string } | null)?.verdash_origem === "nativa";
  } catch {
    return false;
  }
}

async function soltarReserva(admin: SupabaseClient, organizationId: string, id: string) {
  const { error } = await admin
    .from("channel_sessions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) logger.error("verdash_nativo_reserva_nao_solta", { organization_id: organizationId, channel_session_id: id });
}

/** Historico desligado e MELHOR ESFORCO: 404 (FZAP < v1.35) e esperado, o resto so loga. */
async function desligarHistorico(creds: VerdashCredentials, organizationId: string): Promise<void> {
  try {
    await fzapRequest(creds, "/session/history-settings", { method: "PUT", body: HISTORICO_DESLIGADO });
  } catch (err) {
    const st = err instanceof Error ? /verdash_request_failed: (\d{3})/.exec(err.message)?.[1] : undefined;
    if (st !== "404") logger.warn("verdash_nativo_historico_nao_desligado", { organization_id: organizationId, status: st ?? "sem_resposta" });
  }
}

/** Reserva a linha. `false` = a chave ja foi usada (duplo clique). */
async function reservar(
  admin: SupabaseClient,
  i: ConectarNativoInput,
  id: string,
): Promise<{ ok: true } | { ok: false; conflito: boolean; erro: unknown }> {
  const { error } = await admin.from("channel_sessions").insert({
    id,
    organization_id: i.organizationId,
    provider: "verdash",
    verdash_origem: "nativa",
    verdash_instance_name: `${PREFIXO_RESERVA}${id}`,
    display_name: i.rotulo,
    status: "STARTING",
    archived_at: new Date().toISOString(),
    webhook_path_token: i.webhookPathToken,
    webhook_secret_encrypted: i.segredoCifrado,
    metadata: metadataInicialDoCanal(),
  });
  return error ? { ok: false, conflito: error.code === "23505", erro: error } : { ok: true };
}

/** O segundo clique: devolve o canal ja pronto (replay) ou diz que o primeiro ainda corre. */
async function resultadoDoReplay(admin: SupabaseClient, organizationId: string, id: string): Promise<ResultadoNativo> {
  const { data } = await admin
    .from("channel_sessions")
    .select("verdash_instance_name, display_name, archived_at")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  const row = data as { verdash_instance_name: string; display_name: string | null; archived_at: string | null } | null;
  if (!row || row.archived_at || row.verdash_instance_name.startsWith(PREFIXO_RESERVA)) {
    return { ok: false, code: "em_andamento" };
  }
  return {
    ok: true,
    replay: true,
    channelSessionId: id,
    instanceName: row.verdash_instance_name,
    displayName: row.display_name ?? "",
    recebimentoLigado: true,
    recebimentoErro: null,
  };
}

export interface ConectarNativoInput {
  organizationId: string;
  /** So alimenta o nome da instancia (slug + sufixo aleatorio). */
  orgSlug: string;
  rotulo: string;
  idempotencyKey: string;
  webhookPathToken: string;
  webhookUrl: string;
  segredo: string;
  segredoCifrado: string;
}

/**
 * Cria a instancia no FZAP, liga a volta, pede a conexao e grava o canal
 * (STARTING). O QR e lido depois, pela rota de QR, com o id devolvido.
 */
export async function conectarNativo(admin: SupabaseClient, i: ConectarNativoInput): Promise<ResultadoNativo> {
  if (!(await nativoHabilitadoParaOrg(admin, i.organizationId))) {
    return { ok: false, code: "nao_habilitado" };
  }
  const id = idDoCanalNativo(i.organizationId, i.idempotencyKey);
  const reserva = await reservar(admin, i, id);
  if (!reserva.ok) {
    return reserva.conflito
      ? resultadoDoReplay(admin, i.organizationId, id)
      : { ok: false, code: "falha", erro: reserva.erro };
  }
  let inst: InstanciaNativa;
  try {
    inst = await criarInstanciaNativa(admin, {
      organizationId: i.organizationId,
      orgSlug: i.orgSlug,
      rotulo: i.rotulo,
      channelSessionId: id,
    });
  } catch (erro) {
    await soltarReserva(admin, i.organizationId, id);
    return { ok: false, code: "falha", erro };
  }
  const r = await ligarEGravar(admin, i, id, inst);
  if (r.ok) return r;
  // Qualquer falha depois de criar no FZAP: apaga a instancia e solta a reserva.
  try {
    await apagarNativo(admin, { organizationId: i.organizationId, fzapId: inst.fzapId });
  } catch {
    logger.error("verdash_nativo_orfa", { fzapId: inst.fzapId, organization_id: i.organizationId });
  }
  await soltarReserva(admin, i.organizationId, id);
  return r;
}

/** Webhook, conexao, historico e gravacao final. Nao desfaz nada: quem chama decide. */
async function ligarEGravar(
  admin: SupabaseClient,
  i: ConectarNativoInput,
  id: string,
  inst: InstanciaNativa,
): Promise<ResultadoNativo> {
  const creds: VerdashCredentials = {
    instanceName: inst.instanceName,
    token: inst.instanceToken,
    vinculoId: null,
    baseUrl: verdashBaseUrl(),
  };
  let volta: { ok: boolean; reason?: string };
  try {
    // A volta ANTES da conexao, para o primeiro evento ja ter para onde ir. Se falhar,
    // o canal fica e a tela avisa (`recebimento_ligado:false`), como no caminho vinculado.
    volta = await registrarWebhookNaVerdash({
      token: inst.instanceToken,
      webhookUrl: i.webhookUrl,
      segredo: i.segredo,
    });
    await fzapRequest(creds, "/session/connect", { method: "POST", body: {} });
    await desligarHistorico(creds, i.organizationId);
  } catch (erro) {
    return { ok: false, code: "falha", erro };
  }
  const { error } = await saveVerdashSession(admin, {
    organizationId: i.organizationId,
    existingId: id,
    instanceName: inst.instanceName,
    tokenEncrypted: inst.tokenEncrypted,
    webhookPathToken: i.webhookPathToken,
    webhookSecretEncrypted: i.segredoCifrado,
    phoneNumber: null,
    displayName: i.rotulo,
    connected: false,
    origem: "nativa",
    metadata: { ...metadataInicialDoCanal(), fzap_user_id: inst.fzapId },
  });
  if (error) return { ok: false, code: "falha", erro: error };
  return {
    ok: true,
    replay: false,
    channelSessionId: id,
    instanceName: inst.instanceName,
    displayName: i.rotulo,
    recebimentoLigado: volta.ok,
    recebimentoErro: volta.ok ? null : (volta.reason ?? null),
  };
}
