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
}

const VINCULADA: EstadoNativo = { nativa: false, jaConectou: false, metadata: {} };

export async function estadoNativo(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
): Promise<EstadoNativo> {
  try {
    const { data } = await admin
      .from("channel_sessions")
      .select("verdash_origem, metadata")
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null)
      .maybeSingle();
    const row = data as { verdash_origem?: string; metadata?: Record<string, unknown> | null } | null;
    if (row?.verdash_origem !== "nativa") return VINCULADA;
    const metadata = row.metadata ?? {};
    return { nativa: true, jaConectou: typeof metadata.ja_conectou_em === "string", metadata };
  } catch {
    return VINCULADA;
  }
}

/**
 * Grava `ja_conectou_em` na primeira vez que a nativa aparece WORKING. Depois disso,
 * `loggedIn:false` deixa de ser "ainda esperando o QR" e passa a ser FAILED.
 * Melhor esforco: falha de gravacao so adia a marca para a proxima verificacao.
 */
export async function marcarJaConectou(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
): Promise<void> {
  try {
    const e = await estadoNativo(admin, organizationId, instanceName);
    if (!e.nativa || e.jaConectou) return;
    await admin
      .from("channel_sessions")
      .update({ metadata: { ...e.metadata, ja_conectou_em: new Date().toISOString() } })
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null);
  } catch {
    // proxima verificacao tenta de novo
  }
}
