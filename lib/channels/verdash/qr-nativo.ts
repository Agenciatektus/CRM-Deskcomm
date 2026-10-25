/**
 * Verdash NATIVO: QR e saude AO VIVO de um canal que o CRM criou (Fatia 3).
 *
 * As duas funcoes devolvem `null` quando o canal NAO e nativo, para a rota
 * seguir o caminho que ja tinha. O canal vinculado nunca passa por aqui.
 *
 * ─── Rate limit do QR ───────────────────────────────────────────────────────
 *
 * O modal renova a imagem a cada 15 s (o QR do WhatsApp vence em ~20 s), entao
 * "1 a cada 30 s", como o codigo de pareamento, quebraria o uso normal. Regra:
 * ate 6 pedidos por canal em 60 s (4 renovacoes normais mais folga para reabrir
 * o modal ou clicar em "Gerar novo QR"). Acima disso, 429 com `Retry-After: 15`.
 * Ler o QR e barato (so leitura); o que o limite protege e o POST de conexao,
 * que nao pode ser martelado por aba esquecida ou script. Dois baldes: por
 * (canal, usuario) 6/60 s, e um teto do canal inteiro de 10/60 s (varios admins
 * ou abas juntos).
 *
 * So admin le o QR (quem pareia um numero decide sobre a conta da empresa), e so
 * em estado esperado: STARTING, SCAN_QR_CODE ou FAILED (perdeu o login e precisa
 * ler de novo). Canal parado (STOPPED) ou conectado nao reabre o socket por GET.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { verdashAdapter } from "../adapters/verdash";
import { CHANNEL_PROVIDER_VERDASH } from "../capabilities";
import type { ChannelHealth } from "../types";

import { resolveVerdashCreds } from "./credentials";
import { prepararQr } from "./conexao-nativa";

export const QR_NATIVO_LIMITE = 6;
export const QR_NATIVO_LIMITE_CANAL = 10;
const ESTADOS_COM_QR = ["STARTING", "SCAN_QR_CODE", "FAILED"];
export const QR_NATIVO_JANELA_S = 60;

export type RespostaQr =
  | { status: 200; png: Buffer }
  | { status: 403 | 404 | 409 | 429 | 502 | 503; estado: string; retryAfter?: number };

export interface LinhaNativa {
  instanceName: string;
  status: string;
  telefone: string | null;
  arquivada: boolean;
}

export async function lerNativa(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<LinhaNativa | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("provider, verdash_origem, verdash_instance_name, status, phone_number, archived_at")
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .maybeSingle();
  const row = data as { provider?: string; verdash_origem?: string; verdash_instance_name?: string; status?: string; phone_number?: string | null; archived_at?: string | null } | null;
  if (error || !row || row.provider !== CHANNEL_PROVIDER_VERDASH || row.verdash_origem !== "nativa") return null;
  return row.verdash_instance_name
    ? {
        instanceName: row.verdash_instance_name,
        status: row.status ?? "STARTING",
        telefone: row.phone_number ?? null,
        arquivada: !!row.archived_at,
      }
    : null;
}

function pngDoDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return m ? Buffer.from(m[1]!, "base64") : null;
}

/** O QR de um canal nativo, ou `null` se o canal nao e nativo. */
export async function qrDoCanalNativo(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  /** Devolve o id do usuario se ele e admin, `null` se nao. So e chamada para canal nativo. */
  autorizar: () => Promise<string | null>,
): Promise<RespostaQr | null> {
  const nativa = await lerNativa(admin, organizationId, channelSessionId);
  if (!nativa) return null;
  const userId = await autorizar();
  if (!userId) return { status: 403, estado: "forbidden" };
  if (nativa.status === "WORKING") return { status: 409, estado: "connected" };
  if (!ESTADOS_COM_QR.includes(nativa.status)) return { status: 409, estado: `state-${nativa.status.toLowerCase()}` };

  const base = `qr-nativo:${organizationId}:${channelSessionId}`;
  const [porUsuario, porCanal] = [
    await checkRateLimit(`${base}:${userId}`, QR_NATIVO_LIMITE, QR_NATIVO_JANELA_S),
    await checkRateLimit(base, QR_NATIVO_LIMITE_CANAL, QR_NATIVO_JANELA_S),
  ];
  if (!porUsuario.allowed || !porCanal.allowed) return { status: 429, estado: "rate-limited", retryAfter: 15 };

  const creds = await resolveVerdashCreds(admin, { organizationId, instanceName: nativa.instanceName });
  if (!creds) return { status: 409, estado: "no-credential" };
  try {
    // Sessao caida pelo timeout do QR: `prepararQr` reabre (1 connect / 15 s) e espera o QR nascer.
    const p = await prepararQr(creds, organizationId, channelSessionId);
    if (p.estado === "conectado") return { status: 409, estado: "connected" };
    if (p.estado !== "aguardando_leitura") return { status: 404, estado: "qr-not-ready" };
    const png = pngDoDataUrl(p.qr);
    return png ? { status: 200, png } : { status: 502, estado: "qr-invalid" };
  } catch {
    return { status: 502, estado: "upstream-failed" };
  }
}

/** Saude ao vivo de um canal nativo, ou `null` se o canal nao e nativo. */
export async function saudeAoVivoNativa(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<ChannelHealth | null> {
  const nativa = await lerNativa(admin, organizationId, channelSessionId);
  if (!nativa) return null;
  return verdashAdapter.checkHealth!({ organizationId, sessionRef: nativa.instanceName });
}
