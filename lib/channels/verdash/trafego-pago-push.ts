/**
 * Tráfego pago por EMPURRÃO: o FZAP avisa o CRM quando captura ou enriquece um lead.
 *
 * O CRM já completa campanha, conjunto e anúncio por PULL (`fzapAtribuicaoDireta`).
 * Este módulo só acrescenta o gatilho, e o desenho não depende do formato do corpo
 * (que o FZAP não documenta):
 *
 * - O corpo é um GATILHO NÃO CONFIÁVEL. Dele só saem candidatos a telefone; nenhum
 *   dado dele é gravado. Quem preenche o contato é a rotina de PULL, que pergunta ao
 *   FZAP com o token da instância.
 * - A organização vem do CANAL dono do token da URL, nunca do corpo.
 * - O token é segredo por canal: só o HASH (sha256) fica no banco.
 * - Pareado pela Verdash não registra: o CRM não alcança o FZAP nesse modo.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { completarAtribuicaoPelaVerdash } from "./atribuicao-enriquecida";
import { fzapRequest } from "./client";
import type { VerdashCredentials } from "./credentials";

export const TETO_DO_CORPO_BYTES = 64 * 1024;
export const MAX_TELEFONES = 5;
const PROFUNDIDADE_MAX = 6;
const NOS_MAX = 2_000;
const CAMINHO = "/api/v1/webhooks/fzap-trafego-pago/";

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparação em tempo constante de dois hashes hex (tamanhos diferentes = falso). */
export function hashesIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Flag de liberação. Desligada por padrão: sem ela o CRM nunca registra nada no FZAP. */
export function pushLigado(): boolean {
  return /^(1|true)$/i.test(process.env.FZAP_TRAFEGO_PAGO_PUSH?.trim() ?? "");
}

// ─── Extração de telefones ──────────────────────────────────────────────────

const CHAVE_DE_TELEFONE = /phone|telefone|jid|number|numero|chat_?id|from|sender|whatsapp|wa_?id/i;
// Telefone cru (com + espaço, parênteses, hífen) ou JID de pessoa (`5511...:12@s.whatsapp.net`).
const FORMA_DE_TELEFONE = /^\+?[\d\s().-]{8,30}$/;
const FORMA_DE_JID = /^\d{8,20}(?::\d{1,4})?@(?:s\.whatsapp\.net|c\.us)$/i;

function candidato(valor: string): string | null {
  const v = valor.trim();
  if (v.length > 64) return null;
  if (!FORMA_DE_TELEFONE.test(v) && !FORMA_DE_JID.test(v)) return null;
  const digitos = v.split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/**
 * Candidatos a telefone de um corpo qualquer: varre as chaves cujo nome parece
 * telefone/jid/número/chat/from, normaliza para dígitos (8 a 15) e devolve no máximo
 * `MAX_TELEFONES` únicos. Lixo, grupos e valores fora de forma são descartados.
 */
export function extrairTelefones(corpo: unknown): string[] {
  const achados = new Set<string>();
  let visitados = 0;
  const visitar = (no: unknown, chavePai: string | null, nivel: number): void => {
    if (achados.size >= MAX_TELEFONES || nivel > PROFUNDIDADE_MAX || ++visitados > NOS_MAX) return;
    if (typeof no === "string") {
      if (chavePai && CHAVE_DE_TELEFONE.test(chavePai)) {
        const d = candidato(no);
        if (d) achados.add(d);
      }
      return;
    }
    if (Array.isArray(no)) {
      for (const item of no) visitar(item, chavePai, nivel + 1);
      return;
    }
    if (no && typeof no === "object") {
      for (const [k, v] of Object.entries(no as Record<string, unknown>)) visitar(v, k, nivel + 1);
    }
  };
  visitar(corpo, null, 0);
  return [...achados].slice(0, MAX_TELEFONES);
}

/** Mascara para log: nunca o telefone completo. */
export function mascarar(digitos: string): string {
  return `${digitos.slice(0, 2)}***${digitos.slice(-2)}`;
}

// ─── Recepção ───────────────────────────────────────────────────────────────

export interface CanalDoToken {
  channelSessionId: string;
  organizationId: string;
}

/**
 * O canal dono do token, ou `null` (token inexistente, canal arquivado). O banco
 * acha pelo HASH; a comparação final é em tempo constante.
 */
export async function canalDoToken(
  admin: SupabaseClient,
  token: string,
): Promise<CanalDoToken | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const hash = hashDoToken(token);
  const { data } = await admin
    .from("channel_sessions")
    .select("id, organization_id, trafego_push_token_hash")
    .eq("trafego_push_token_hash", hash)
    .is("archived_at", null)
    .maybeSingle();
  const guardado = (data as { trafego_push_token_hash?: string | null } | null)
    ?.trafego_push_token_hash;
  if (!data || !guardado || !hashesIguais(guardado, hash)) return null;
  const linha = data as { id: string; organization_id: string };
  return { channelSessionId: linha.id, organizationId: linha.organization_id };
}

/**
 * Dispara o PULL de cada telefone único para o contato DESTA organização. Nada do
 * corpo é gravado. Nunca lança.
 */
export async function dispararEnriquecimento(
  admin: SupabaseClient,
  canal: CanalDoToken,
  corpo: unknown,
): Promise<number> {
  const telefones = extrairTelefones(corpo);
  let disparados = 0;
  for (const digitos of telefones) {
    try {
      const { data } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", canal.organizationId)
        .in("phone_number", phoneLookupVariants(`+${digitos}`))
        .limit(1)
        .maybeSingle();
      if (!data) continue;
      await completarAtribuicaoPelaVerdash(admin, canal.organizationId, (data as { id: string }).id, {
        ignorarEspera: true,
      });
      disparados += 1;
    } catch (err) {
      logger.warn("[trafego-pago-push] enriquecimento falhou", {
        channel_session_id: canal.channelSessionId,
        telefone: mascarar(digitos),
        erro: err instanceof Error ? err.message.slice(0, 120) : "desconhecido",
      });
    }
  }
  logger.info("[trafego-pago-push] gatilho processado", {
    channel_session_id: canal.channelSessionId,
    candidatos: telefones.length,
    disparados,
  });
  return disparados;
}

// ─── Registro no FZAP ───────────────────────────────────────────────────────

export type ResultadoDoRegistro =
  | { registrado: true }
  | { registrado: false; motivo: string };

const CAMPOS_SOMENTE_LEITURA = new Set(["id", "createdAt", "updatedAt"]);

/** O GET devolve segredo mascarado (`***`): reenviá-lo gravaria os asteriscos no lugar do token. */
function estaMascarado(v: unknown): boolean {
  return typeof v === "string" && v.includes("***");
}

export function montarConfig(
  existente: Record<string, unknown> | null,
  webhookUrl: string,
): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existente ?? {})) {
    if (CAMPOS_SOMENTE_LEITURA.has(k)) continue;
    if (k === "fbGraphAccessToken" && (v == null || estaMascarado(v))) continue;
    corpo[k] = v;
  }
  return {
    ...corpo,
    webhookUrl,
    webhookActive: true,
    webhookOnCapture: true,
    webhookOnEnrichment: true,
  };
}

function urlDoPush(token: string): string | null {
  const base = env.NEXT_PUBLIC_APP_URL;
  if (!base || base.includes("placeholder.invalid")) return null;
  return `${base.replace(/\/+$/, "")}${CAMINHO}${token}`;
}

/**
 * Liga o empurrão na instância do canal. Best-effort: nunca lança e nunca derruba a
 * conexão do canal; o PULL continua valendo sem ele. Idempotente: cada chamada troca
 * o token (só o hash é guardado) e reenvia a configuração mesclada.
 */
export async function registrarPushDeTrafegoPago(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; creds: VerdashCredentials },
): Promise<ResultadoDoRegistro> {
  if (!pushLigado()) return { registrado: false, motivo: "desligado" };
  // Pareado: o CRM não alcança o FZAP; quem fala com ele é a Verdash.
  if (input.creds.vinculoId) return { registrado: false, motivo: "pareado" };
  try {
    const token = randomBytes(32).toString("base64url");
    const url = urlDoPush(token);
    if (!url) return { registrado: false, motivo: "sem_url_publica" };

    // Sem o GET não há como preservar a configuração: não escreve às cegas.
    const atual = await fzapRequest<Record<string, unknown> | null>(
      input.creds,
      "/paid-traffic/config",
      { method: "GET" },
    );
    const existente = atual && typeof atual === "object" ? atual : null;
    const urlAtual = existente?.webhookUrl;
    // Webhook de outra pessoa não se sobrescreve; o nosso (de registro anterior) sim.
    if (typeof urlAtual === "string" && urlAtual && !urlAtual.includes(CAMINHO)) {
      return { registrado: false, motivo: "webhook_de_terceiro" };
    }

    await fzapRequest(input.creds, "/paid-traffic/config", {
      method: "POST",
      body: montarConfig(existente, url),
    });
    const { error } = await admin
      .from("channel_sessions")
      .update({ trafego_push_token_hash: hashDoToken(token) })
      .eq("organization_id", input.organizationId)
      .eq("id", input.channelSessionId);
    if (error) throw new Error("hash_nao_gravado");
    return { registrado: true };
  } catch (err) {
    logger.warn("[trafego-pago-push] registro falhou; o canal segue só com o PULL", {
      channel_session_id: input.channelSessionId,
      erro: err instanceof Error ? err.message.slice(0, 80) : "desconhecido",
    });
    return { registrado: false, motivo: "falhou" };
  }
}
