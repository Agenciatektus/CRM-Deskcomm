/**
 * Grava a conexão de LEITURA da conta de anúncios: o único caminho que cifra o
 * token e faz o upsert em `ad_insights_connections`.
 *
 * Usado pela tela (token colado, `updateAdInsightsConnection.ts`) e pelo
 * callback do OAuth da Meta. Os dois passam por aqui para a cifra e o upsert
 * não terem duas versões.
 *
 * ⚠️ EXIGE O ADMIN CLIENT (RLS ligada, zero policies, grants revogados).
 * Cifra antes do upsert, e se não puder cifrar RECUSA: nunca grava em claro.
 *
 * Colar um token novo à mão zera a procedência do anterior (validade, escopos e
 * usuário Meta), porque esses dados descreviam o token que saiu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export type ProcedenciaDaConexao = "manual" | "oauth";

export interface ConexaoDeLeituraParaGravar {
  organizationId: string;
  userId: string;
  platform: "meta_ads";
  /** Ausente = manter o token gravado. */
  accessToken?: string;
  /** `undefined` = não mexer; `null` = limpar. */
  defaultAccountId?: string | null;
  /** Só com `accessToken`. Ausente = token colado à mão. */
  oauth?: { expiraEm: string | null; scopes: string[]; metaUserId: string | null };
}

export type ResultadoDaGravacao =
  { ok: true } | { ok: false; error: "cifra_indisponivel" | "erro_ao_gravar"; detalhe?: string };

export async function gravarConexaoDeLeitura(
  admin: SupabaseClient,
  c: ConexaoDeLeituraParaGravar,
): Promise<ResultadoDaGravacao> {
  const valores: Record<string, unknown> = {
    organization_id: c.organizationId,
    platform: c.platform,
    updated_by: c.userId,
  };
  if (c.defaultAccountId !== undefined) valores.default_account_id = c.defaultAccountId;

  if (c.accessToken) {
    const cifrado = await encryptWebhookSecret(admin, c.accessToken);
    if (!cifrado) return { ok: false, error: "cifra_indisponivel" };
    valores.access_token_encrypted = cifrado;
    valores.connected_via = (c.oauth ? "oauth" : "manual") satisfies ProcedenciaDaConexao;
    valores.token_expires_at = c.oauth?.expiraEm ?? null;
    valores.scopes = c.oauth?.scopes ?? null;
    valores.meta_user_id = c.oauth?.metaUserId ?? null;
  }

  const { error } = await admin
    .from("ad_insights_connections")
    .upsert(valores, { onConflict: "organization_id,platform" });
  if (error) return { ok: false, error: "erro_ao_gravar", detalhe: error.message };
  return { ok: true };
}
