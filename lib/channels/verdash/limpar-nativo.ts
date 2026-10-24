/**
 * Ciclo de vida da instancia NATIVA ao arquivar/excluir o canal.
 *
 * So a nativa: a vinculada e da Verdash e NUNCA e tocada aqui (zero chamadas ao
 * FZAP). Falha do FZAP nao impede o canal de ser arquivado no CRM: o resultado
 * `pendente` loga `verdash_nativo_limpeza_pendente` (sem token) e marca o canal por
 * RPC atomica, para o varredor/runbook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { resolveVerdashCreds } from "./credentials";
import type { VerdashCredentials } from "./credentials";
import {
  apagarNativo,
  desligarNativo,
  faxinarOrfaDoCanal,
  resumoDoErro,
} from "./nativo";

export type ResultadoLimpeza = "nao_nativa" | "ok" | "pendente";

const JA_NAO_EXISTE = "verdash_nativo_instancia_nao_encontrada";

/** Loga sem token e marca o canal (melhor esforco: o log ja garante o rastro). */
export async function registrarLimpezaPendente(
  admin: SupabaseClient,
  i: { organizationId: string; channelSessionId: string; fzapId: string | null; motivo: string },
): Promise<void> {
  logger.error("verdash_nativo_limpeza_pendente", {
    fzapId: i.fzapId,
    organization_id: i.organizationId,
    channel_session_id: i.channelSessionId,
    motivo: i.motivo,
  });
  try {
    await admin.rpc("fn_marcar_limpeza_nativa", {
      p_org: i.organizationId,
      p_canal: i.channelSessionId,
      p_pendente: true,
    });
  } catch {
    // o log acima e o rastro
  }
}

/**
 * `apagar: false` = so desconecta (disconnect + logout); `true` = tambem apaga a
 * instancia do FZAP. Nunca lanca por causa do FZAP.
 */
export async function limparNativoDoCanal(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; apagar: boolean },
): Promise<ResultadoLimpeza> {
  const { organizationId, channelSessionId } = input;
  const { data } = await admin
    .from("channel_sessions")
    .select("verdash_origem, verdash_instance_name, metadata")
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .maybeSingle();
  const row = data as {
    verdash_origem?: string;
    verdash_instance_name?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
  if (row?.verdash_origem !== "nativa") return "nao_nativa";

  const fzapId = typeof row.metadata?.fzap_user_id === "string" ? row.metadata.fzap_user_id : null;
  const falha = (motivo: string) =>
    registrarLimpezaPendente(admin, { organizationId, channelSessionId, fzapId, motivo }).then(
      () => "pendente" as const,
    );

  try {
    if (!fzapId) {
      // Reserva que morreu antes de gravar o id: acha a orfa pelo channel_session_id.
      await faxinarOrfaDoCanal(admin, organizationId, channelSessionId);
      return "ok";
    }
    let creds: VerdashCredentials | null = null;
    try {
      creds = await resolveVerdashCreds(admin, {
        organizationId,
        instanceName: row.verdash_instance_name ?? "",
      });
    } catch {
      creds = null;
    }
    if (creds) {
      try {
        await desligarNativo(admin, { organizationId, fzapId, creds });
      } catch (err) {
        // Instancia ja apagada conta como limpa; outra falha so pesa se nao for apagar.
        if (!input.apagar && !String(err instanceof Error ? err.message : "").startsWith(JA_NAO_EXISTE)) {
          return await falha(resumoDoErro(err));
        }
      }
    } else if (!input.apagar) {
      return await falha("sem_credencial");
    }
    if (!input.apagar) return "ok";
    try {
      await apagarNativo(admin, { organizationId, fzapId });
    } catch (err) {
      if (!String(err instanceof Error ? err.message : "").startsWith(JA_NAO_EXISTE)) {
        return await falha(resumoDoErro(err));
      }
    }
    return "ok";
  } catch (err) {
    return await falha(resumoDoErro(err));
  }
}
