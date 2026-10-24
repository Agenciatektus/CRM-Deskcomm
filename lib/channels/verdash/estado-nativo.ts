/**
 * Leituras e marcas da linha do canal NATIVO (Fatia 3). Todas toleram erro de
 * banco: na duvida o canal e tratado como vinculada, que e o comportamento antigo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

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

export interface EstadoNativo {
  nativa: boolean;
  /** Ja esteve WORKING alguma vez (marca `ja_conectou_em` no metadata). */
  jaConectou: boolean;
  metadata: Record<string, unknown>;
  status: string | null;
  lastStatusChangeAt: string | null;
}

const VINCULADA: EstadoNativo = {
  nativa: false,
  jaConectou: false,
  metadata: {},
  status: null,
  lastStatusChangeAt: null,
};

/** `connected:false` por mais que isto, seguido, deixa de ser reconexao normal: FAILED com aviso. */
export const LIMITE_DESCONECTADA_MS = 10 * 60_000;

export async function estadoNativo(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
): Promise<EstadoNativo> {
  try {
    const { data } = await admin
      .from("channel_sessions")
      .select("verdash_origem, metadata, status, last_status_change_at")
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null)
      .maybeSingle();
    const row = data as {
      verdash_origem?: string;
      metadata?: Record<string, unknown> | null;
      status?: string | null;
      last_status_change_at?: string | null;
    } | null;
    if (row?.verdash_origem !== "nativa") return VINCULADA;
    const metadata = row.metadata ?? {};
    return {
      nativa: true,
      jaConectou: typeof metadata.ja_conectou_em === "string",
      metadata,
      status: row.status ?? null,
      lastStatusChangeAt: row.last_status_change_at ?? null,
    };
  } catch {
    return VINCULADA;
  }
}

/**
 * A nativa esta de pe: grava `ja_conectou_em` na primeira vez (depois disso,
 * `loggedIn:false` deixa de ser "esperando o QR" e passa a ser FAILED) e limpa
 * `desconectado_em`. Devolve true so na PRIMEIRA vez. Melhor esforco: falha de
 * gravacao so adia a marca para a proxima verificacao.
 */
export async function marcarJaConectou(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
): Promise<boolean> {
  try {
    const e = await estadoNativo(admin, organizationId, instanceName);
    if (!e.nativa) return false;
    if (e.jaConectou && !("desconectado_em" in e.metadata)) return false;
    const { desconectado_em: _limpo, ...resto } = e.metadata;
    await admin
      .from("channel_sessions")
      .update({ metadata: { ...resto, ja_conectou_em: e.jaConectou ? resto.ja_conectou_em : new Date().toISOString() } })
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null);
    return !e.jaConectou;
  } catch {
    return false;
  }
}

/** Marca o inicio da queda do socket (so se ainda nao houver), para o debounce do vigia. */
export async function marcarDesconectada(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
  metadata: Record<string, unknown>,
  agoraMs: number = Date.now(),
): Promise<void> {
  try {
    await admin
      .from("channel_sessions")
      .update({ metadata: { ...metadata, desconectado_em: new Date(agoraMs).toISOString() } })
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null);
  } catch {
    // o proximo ciclo do vigia tenta de novo
  }
}

/**
 * Ha quanto tempo o socket esta caido? `null` = nao sabemos (primeira observacao).
 * `desconectado_em` manda; sem ele, `last_status_change_at` so vale se a linha ja
 * nao estava WORKING (senao seria o WORKING de dias atras, e o primeiro tropeco
 * viraria FAILED na hora).
 */
export function msDesconectada(e: EstadoNativo, agoraMs: number = Date.now()): number | null {
  const marca = typeof e.metadata.desconectado_em === "string" ? e.metadata.desconectado_em : null;
  const desde = marca ?? (e.status && e.status !== "WORKING" ? e.lastStatusChangeAt : null);
  const t = desde ? new Date(desde).getTime() : NaN;
  return Number.isFinite(t) ? agoraMs - t : null;
}

/** Janela em que a nativa recem-criada, que nunca conectou, pode ficar no QR sem aviso critico. */
export const CARENCIA_QR_NATIVO_MS = 30 * 60_000;

/**
 * A nativa esta esperando a PRIMEIRA leitura do QR dentro da janela de carencia?
 * Quem acabou de pedir o QR nao precisa de alerta dizendo "escaneie o QR".
 * Vinculada, nativa que ja conectou ou criada ha mais de 30 min: false (avisa normal).
 * Erro de banco = false (na duvida, avisa).
 */
export async function nativaEmCarenciaDoQr(
  admin: SupabaseClient,
  channelSessionId: string,
  agoraMs: number = Date.now(),
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("channel_sessions")
      .select("verdash_origem, metadata, created_at")
      .eq("id", channelSessionId)
      .maybeSingle();
    const row = data as { verdash_origem?: string; metadata?: Record<string, unknown> | null; created_at?: string } | null;
    if (row?.verdash_origem !== "nativa") return false;
    if (typeof row.metadata?.ja_conectou_em === "string") return false;
    const criada = row.created_at ? new Date(row.created_at).getTime() : NaN;
    return Number.isFinite(criada) && agoraMs - criada < CARENCIA_QR_NATIVO_MS;
  } catch {
    return false;
  }
}
