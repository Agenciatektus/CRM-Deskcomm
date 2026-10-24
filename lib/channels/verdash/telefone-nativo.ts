/**
 * Telefone da nativa: ela nasce sem numero (so o QR a liga a um), e sem telefone
 * escapa da trava de numero unico (`channel_sessions_phone_per_org_unique`, 0106).
 * Ao conectar pela primeira vez le o `jid` de `/session/status` e preenche a linha.
 * Melhor esforco: nunca derruba quem chama.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { fzapRequest } from "./client";
import { numeroEmOutraOrganizacao } from "./conectar";
import { resolveVerdashCreds } from "./credentials";
import { telefoneDoJid } from "./webhook";

export type ResultadoTelefone = "preenchido" | "ja_tinha" | "sem_jid" | "conflito" | "falhou";

export async function preencherTelefoneNativo(
  admin: SupabaseClient,
  organizationId: string,
  instanceName: string,
): Promise<ResultadoTelefone> {
  try {
    const creds = await resolveVerdashCreds(admin, { organizationId, instanceName });
    if (!creds) return "falhou";
    const { data: linha } = await admin
      .from("channel_sessions")
      .select("id, phone_number, display_name")
      .eq("organization_id", organizationId)
      .eq("verdash_instance_name", instanceName)
      .is("archived_at", null)
      .maybeSingle();
    const row = linha as { id: string; phone_number: string | null; display_name: string | null } | null;
    if (!row) return "falhou";
    if (row.phone_number) return "ja_tinha";

    const st = await fzapRequest<{ jid?: string }>(creds, "/session/status");
    const telefone = telefoneDoJid(typeof st?.jid === "string" ? st.jid : null);
    if (!telefone) return "sem_jid";

    const patch: Record<string, unknown> = { phone_number: telefone };
    if (!row.display_name) patch.display_name = telefone;
    const { error } = await admin
      .from("channel_sessions")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", row.id);
    if (!error) return "preenchido";
    // 23505 so pode ser a trava de numero unico: este numero ja e de OUTRO canal
    // ativo da org. O canal segue funcionando sem telefone; fica o registro.
    if (error.code === "23505" || numeroEmOutraOrganizacao(error.message ?? null)) {
      logger.warn("verdash_nativo_telefone_em_conflito", { organization_id: organizationId, channel_session_id: row.id });
      return "conflito";
    }
    return "falhou";
  } catch {
    return "falhou";
  }
}
