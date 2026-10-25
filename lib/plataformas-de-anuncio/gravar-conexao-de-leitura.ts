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
  /** `null` na renovação automática (cron): não há pessoa por trás. */
  userId: string | null;
  platform: "meta_ads";
  /** Ausente = manter o token gravado. */
  accessToken?: string;
  /** `undefined` = não mexer; `null` = limpar. */
  defaultAccountId?: string | null;
  /** Só com `accessToken`. Ausente = token colado à mão. */
  oauth?: { expiraEm: string | null; scopes: string[] | null; metaUserId: string | null };
}

export type ResultadoDaGravacao =
  { ok: true } | { ok: false; error: "cifra_indisponivel" | "erro_ao_gravar"; detalhe?: string };

export type ResultadoDaRenovacao =
  | { ok: true }
  | { ok: false; error: "cifra_indisponivel" | "erro_ao_gravar" | "superada"; detalhe?: string };

/**
 * A renovação automática: troca o token E a validade, SÓ se a linha ainda tem o
 * token que a rodada leu.
 *
 * Não é upsert de propósito. Entre ler a linha e gravar passam até minutos (a
 * rodada fala com a Meta, uma conexão por vez); nesse intervalo a pessoa pode
 * colar um token novo, refazer o login ou DESCONECTAR. Um upsert sobrescreveria o
 * token novo com o renovado a partir do velho, ou recriaria a linha apagada, que é
 * desfazer uma revogação. O UPDATE condicional casa zero linhas nesses casos e a
 * rodada desiste daquela conexão (`superada`).
 *
 * Mexe só em `access_token_encrypted` e `token_expires_at`: procedência, escopos,
 * usuário Meta, conta padrão e `updated_by` ficam como estão.
 */
export async function renovarConexaoDeLeitura(
  admin: SupabaseClient,
  c: { organizationId: string; cifraAnterior: string; accessToken: string; expiraEm: string },
): Promise<ResultadoDaRenovacao> {
  const cifrado = await encryptWebhookSecret(admin, c.accessToken);
  if (!cifrado) return { ok: false, error: "cifra_indisponivel" };

  const { data, error } = await admin
    .from("ad_insights_connections")
    .update({ access_token_encrypted: cifrado, token_expires_at: c.expiraEm })
    .eq("organization_id", c.organizationId)
    .eq("platform", "meta_ads")
    .eq("connected_via", "oauth")
    .eq("access_token_encrypted", c.cifraAnterior)
    .select("organization_id");
  if (error) return { ok: false, error: "erro_ao_gravar", detalhe: error.message };
  if (!data || data.length === 0) return { ok: false, error: "superada" };
  return { ok: true };
}

export async function gravarConexaoDeLeitura(
  admin: SupabaseClient,
  c: ConexaoDeLeituraParaGravar,
): Promise<ResultadoDaGravacao> {
  const valores: Record<string, unknown> = {
    organization_id: c.organizationId,
    platform: c.platform,
  };
  if (c.userId) valores.updated_by = c.userId;
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
