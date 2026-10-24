import type { SupabaseClient } from "@supabase/supabase-js";

import { PREFIXO_RESERVA, RESERVA_VELHA_MS } from "./conectar-nativo";
import { lerPastaDaOrg, listarDaPasta } from "./nativo";

/**
 * Varredor de orfas: instancias da pasta da org cujo `metadata.channel_session_id`
 * nao tem linha ATIVA (nao arquivada, ou reserva em andamento) no CRM. So detecta; quem decide apagar e o
 * runbook/cron. Instancia sem channel_session_id no metadata (nao e do CRM) fica de fora.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listarOrfasDaPasta(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Array<{ fzapId: string; name: string; channelSessionId: string }>> {
  const pasta = await lerPastaDaOrg(admin, organizationId);
  if (!pasta) return [];
  // Valor que nao e uuid derrubaria a varredura inteira (22P02 no `.in("id")`).
  const doCrm = (await listarDaPasta(pasta)).filter(
    (i) =>
      i.id &&
      i.metadata?.organization_id === organizationId &&
      UUID.test(String(i.metadata?.channel_session_id ?? "")),
  );
  if (doCrm.length === 0) return [];
  const ids = doCrm.map((i) => i.metadata!.channel_session_id!);
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, archived_at, created_at, verdash_instance_name")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw new Error(`verdash_nativo_orfas_lookup_failed: ${error.code ?? "sem_codigo"}`);
  // Vivo = linha ativa, ou reserva (nasce arquivada) de criacao em andamento: a reserva
  // mais velha que RESERVA_VELHA_MS morreu no meio e NAO conta.
  const agora = Date.now();
  const vivos = new Set(
    ((data ?? []) as Array<{
      id: string;
      archived_at: string | null;
      created_at: string | null;
      verdash_instance_name: string | null;
    }>)
      .filter((r) => !r.archived_at || (reservaViva(r.verdash_instance_name, r.created_at, agora)))
      .map((r) => r.id),
  );
  return doCrm
    .filter((i) => !vivos.has(i.metadata!.channel_session_id!))
    .map((i) => ({ fzapId: i.id!, name: i.name ?? "", channelSessionId: i.metadata!.channel_session_id! }));
}

function reservaViva(nome: string | null | undefined, criada: string | null, agora: number): boolean {
  if (!nome?.startsWith(PREFIXO_RESERVA)) return false;
  const t = criada ? new Date(criada).getTime() : NaN;
  return Number.isFinite(t) && agora - t <= RESERVA_VELHA_MS;
}
