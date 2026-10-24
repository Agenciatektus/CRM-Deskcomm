import type { SupabaseClient } from "@supabase/supabase-js";

import { PREFIXO_RESERVA } from "./conectar-nativo";
import { lerPastaDaOrg, listarDaPasta } from "./nativo";

/**
 * Varredor de orfas: instancias da pasta da org cujo `metadata.channel_session_id`
 * nao tem linha ATIVA (nao arquivada, ou reserva em andamento) no CRM. So detecta; quem decide apagar e o
 * runbook/cron. Instancia sem channel_session_id no metadata (nao e do CRM) fica de fora.
 */
export async function listarOrfasDaPasta(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Array<{ fzapId: string; name: string; channelSessionId: string }>> {
  const pasta = await lerPastaDaOrg(admin, organizationId);
  if (!pasta) return [];
  const doCrm = (await listarDaPasta(pasta)).filter(
    (i) => i.id && i.metadata?.organization_id === organizationId && i.metadata?.channel_session_id,
  );
  if (doCrm.length === 0) return [];
  const ids = doCrm.map((i) => i.metadata!.channel_session_id!);
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, archived_at, verdash_instance_name")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw new Error(`verdash_nativo_orfas_lookup_failed: ${error.code ?? "sem_codigo"}`);
  // Vivo = linha ativa, ou a reserva (nasce arquivada) de uma criacao em andamento.
  const vivos = new Set(
    ((data ?? []) as Array<{ id: string; archived_at: string | null; verdash_instance_name: string }>)
      .filter((r) => !r.archived_at || r.verdash_instance_name.startsWith(PREFIXO_RESERVA))
      .map((r) => r.id),
  );
  return doCrm
    .filter((i) => !vivos.has(i.metadata!.channel_session_id!))
    .map((i) => ({ fzapId: i.id!, name: i.name ?? "", channelSessionId: i.metadata!.channel_session_id! }));
}
