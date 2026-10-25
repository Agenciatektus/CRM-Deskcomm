/**
 * Verdash NATIVO: a EXPERIENCIA de conexao (QR e codigo por numero), Fatia 7.
 *
 * O WhatsApp ENCERRA a sessao ~3 min depois de um QR sem leitura; dai em diante
 * `GET /session/qr` do FZAP da 500 ate `POST /session/connect` de novo. Por isso
 * quem le o estado aqui REABRE a conexao quando ela caiu, e o front (que faz poll
 * de 2,5 s) nunca fica com imagem morta.
 *
 * Tres baldes, de proposito separados:
 *   - LEITURA (status/qr), por (canal, usuario), 60 por 60 s: o poll normal gasta 24;
 *   - CONNECT, por canal, 1 a cada 15 s: o unico POST que mexe no socket;
 *   - CODIGO por numero, por canal, 1 a cada 30 s (como `lib/channels/pairing-code.ts`).
 *
 * Contrato medido (FZAP v1.35.2, producao 25/10/2026): `/session/qr` =>
 * `{data:{qrCode:"data:image/png;base64,..."}}`; `/session/status` =>
 * `{data:{connected,loggedIn,jid}}`; `/session/pairphone` => `{data:{LinkingCode}}`
 * (so a spec; forma desconhecida FALHA FECHADO, LRN-20261024-004).
 * Nada do corpo/URL/token do FZAP sai em erro ou log: so mensagem fixa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { logger } from "@/lib/logger";

import { fzapRequest } from "./client";
import { resolveVerdashCreds, type VerdashCredentials } from "./credentials";
import { marcarJaConectou } from "./estado-nativo";
import { resumoDoErro, statusNativo } from "./nativo";
import { lerNativa, type LinhaNativa } from "./qr-nativo";
import { preencherTelefoneNativo } from "./telefone-nativo";

export const LEITURA_LIMITE = 60;
export const LEITURA_JANELA_S = 60;
export const CONNECT_JANELA_S = 15;
export const CODIGO_JANELA_S = 30;
const ESPERA_APOS_CONNECT_MS = 2000;

export type EstadoConexao = "gerando" | "aguardando_leitura" | "conectado" | "reconectando" | "erro";

export interface CorpoConexao {
  estado: EstadoConexao;
  qr?: string;
  telefone?: string | null;
  mensagem?: string;
  atualizado_em: string;
}

export type Resposta<T> =
  | { status: 200; corpo: T }
  | { status: 400 | 403 | 404 | 409 | 429 | 502; estado: string; retryAfter?: number };

export interface OpcoesConexao {
  /** Espera entre `connect` e a leitura do QR (o QR nasce assincrono). Testes passam 0. */
  esperaMs?: number;
}

const MSG_ERRO = "Não foi possível gerar o QR agora.";
const agora = () => new Date().toISOString();
const dormir = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/** `POST /session/connect`: reabre o socket (a sessao pode ter caido pelo timeout do QR). */
export async function conectarSessaoNativa(creds: VerdashCredentials): Promise<void> {
  await fzapRequest(creds, "/session/connect", { method: "POST", body: {} });
}

/** O QR como data URL, ou null se ainda nao nasceu. Forma desconhecida => null (nunca vai para um <img>). */
async function lerQr(creds: VerdashCredentials): Promise<string | null> {
  const d = await fzapRequest<{ qrCode?: unknown; QRCode?: unknown }>(creds, "/session/qr");
  const v = d?.qrCode ?? d?.QRCode;
  return typeof v === "string" && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
}

/** Garante socket aberto, respeitando 1 connect / 15 s por canal. `false` = ja pedido ha pouco. */
async function reabrir(creds: VerdashCredentials, org: string, canal: string, o: OpcoesConexao): Promise<boolean> {
  const lim = await checkRateLimit(`conexao-nativa-connect:${org}:${canal}`, 1, CONNECT_JANELA_S);
  if (!lim.allowed) return false;
  await conectarSessaoNativa(creds);
  await dormir(o.esperaMs ?? ESPERA_APOS_CONNECT_MS);
  return true;
}

export type Passo = { estado: "conectado" } | { estado: "aguardando_leitura"; qr: string } | { estado: "gerando" | "reconectando" };

/** Status -> (se caiu, connect) -> QR. Compartilhado com a rota antiga `/qr`. LANCA se o FZAP falhar. */
export async function prepararQr(creds: VerdashCredentials, org: string, canal: string, o: OpcoesConexao = {}): Promise<Passo> {
  const st = await statusNativo(creds);
  if (st === "conectado") return { estado: "conectado" };
  let reaberta = false;
  if (st === "desconectado") {
    if (!(await reabrir(creds, org, canal, o))) return { estado: "reconectando" };
    reaberta = true;
  }
  const qr = await lerQr(creds);
  if (qr) return { estado: "aguardando_leitura", qr };
  return { estado: reaberta ? "reconectando" : "gerando" };
}

interface Contexto {
  nativa: LinhaNativa;
  userId: string;
  creds: VerdashCredentials;
}

async function abrirContexto(
  admin: SupabaseClient,
  org: string,
  canal: string,
  autorizar: () => Promise<string | null>,
): Promise<Contexto | Resposta<never> | null> {
  const nativa = await lerNativa(admin, org, canal);
  if (!nativa) return null;
  const userId = await autorizar();
  if (!userId) return { status: 403, estado: "forbidden" };
  if (nativa.arquivada) return { status: 409, estado: "archived" };
  const creds = await resolveVerdashCreds(admin, { organizationId: org, instanceName: nativa.instanceName });
  if (!creds) return { status: 409, estado: "no-credential" };
  return { nativa, userId, creds };
}

const ehResposta = (c: Contexto | Resposta<never>): c is Resposta<never> => "status" in c;

/** Estado da conexao de um canal nativo, ou `null` se o canal nao e nativo. */
export async function estadoDaConexaoNativa(
  admin: SupabaseClient,
  org: string,
  canal: string,
  autorizar: () => Promise<string | null>,
  opcoes: OpcoesConexao = {},
): Promise<Resposta<CorpoConexao> | null> {
  const ctx = await abrirContexto(admin, org, canal, autorizar);
  if (!ctx) return null;
  if (ehResposta(ctx)) return ctx;
  const lim = await checkRateLimit(`conexao-nativa-leitura:${org}:${canal}:${ctx.userId}`, LEITURA_LIMITE, LEITURA_JANELA_S);
  if (!lim.allowed) return { status: 429, estado: "rate-limited", retryAfter: 15 };

  try {
    const p = await prepararQr(ctx.creds, org, canal, opcoes);
    if (p.estado === "aguardando_leitura") return { status: 200, corpo: { estado: p.estado, qr: p.qr, atualizado_em: agora() } };
    if (p.estado !== "conectado") return { status: 200, corpo: { estado: p.estado, atualizado_em: agora() } };
    await marcarJaConectou(admin, org, ctx.nativa.instanceName);
    await preencherTelefoneNativo(admin, org, ctx.nativa.instanceName);
    const depois = await lerNativa(admin, org, canal);
    return { status: 200, corpo: { estado: "conectado", telefone: depois?.telefone ?? null, atualizado_em: agora() } };
  } catch (e) {
    logger.warn("verdash_nativo_conexao_falhou", { organization_id: org, channel_session_id: canal, motivo: resumoDoErro(e) });
    return { status: 200, corpo: { estado: "erro", mensagem: MSG_ERRO, atualizado_em: agora() } };
  }
}

/** Telefone BR/E.164 so com digitos: DDD+numero (10/11) ganha DDI 55; 10 a 15 digitos. */
export function normalizarTelefone(bruto: string): string | null {
  const d = bruto.replace(/\D/g, "");
  const completo = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^[1-9]\d{9,14}$/.test(completo) ? completo : null;
}

/** `ABCD1234` / `abcd-1234` -> `ABCD-1234`; qualquer outra forma => null (falha fechado). */
export function formatarCodigo(v: unknown): string | null {
  const m = typeof v === "string" ? /^([A-Z0-9]{4})-?([A-Z0-9]{4})$/i.exec(v.trim()) : null;
  return m ? `${m[1]}-${m[2]}`.toUpperCase() : null;
}

/** Codigo de pareamento por numero de um canal nativo, ou `null` se o canal nao e nativo. */
export async function codigoPorNumero(
  admin: SupabaseClient,
  org: string,
  canal: string,
  telefone: string,
  autorizar: () => Promise<string | null>,
  opcoes: OpcoesConexao = {},
): Promise<Resposta<{ codigo: string }> | null> {
  const ctx = await abrirContexto(admin, org, canal, autorizar);
  if (!ctx) return null;
  if (ehResposta(ctx)) return ctx;
  const phone = normalizarTelefone(telefone);
  if (!phone) return { status: 400, estado: "invalid-phone" };
  const lim = await checkRateLimit(`codigo-nativo:${org}:${canal}`, 1, CODIGO_JANELA_S);
  if (!lim.allowed) return { status: 429, estado: "rate-limited", retryAfter: CODIGO_JANELA_S };

  try {
    const st = await statusNativo(ctx.creds);
    if (st === "conectado") return { status: 409, estado: "connected" };
    if (st === "desconectado") await reabrir(ctx.creds, org, canal, opcoes);
    const d = await fzapRequest<{ LinkingCode?: unknown }>(ctx.creds, "/session/pairphone", { method: "POST", body: { phone } });
    const codigo = formatarCodigo(d?.LinkingCode);
    if (!codigo) {
      logger.warn("verdash_nativo_pairphone_formato_desconhecido", { organization_id: org, channel_session_id: canal });
      return { status: 502, estado: "code-invalid" };
    }
    return { status: 200, corpo: { codigo } };
  } catch (e) {
    logger.warn("verdash_nativo_pairphone_falhou", { organization_id: org, channel_session_id: canal, motivo: resumoDoErro(e) });
    return { status: 502, estado: "upstream-failed" };
  }
}
