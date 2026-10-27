/**
 * Credencial da loja Nuvemshop de UMA organização (token já decifrado).
 *
 * Fonte única: o indexador do RAG e a consulta de estoque ao vivo leem o token
 * por aqui. Service role: o filtro por `organization_id` é manual e obrigatório.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export async function credenciaisDaLoja(
  organizationId: string,
): Promise<{ accessToken: string; storeId: string } | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tenant_integrations")
    .select("id, organization_id, provider, store_metadata, oauth_access_token_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", "nuvemshop")
    // `healthy`, e não `active`: o CHECK de `tenant_integrations` aceita
    // connecting | healthy | token_expired | scope_missing | disconnected |
    // rate_limited | error. `active` NUNCA existiu, então este filtro devolvia
    // zero linhas para toda organização — e, com credencial nula, o catálogo
    // não tinha como ser lido nem que todo o resto estivesse certo.
    .eq("status", "healthy")
    .maybeSingle();

  if (error || !data) return null;

  const meta = (data as { store_metadata: Record<string, unknown> | null }).store_metadata ?? {};
  const storeId = String(meta["store_id"] ?? meta["id"] ?? "");
  if (!storeId) return null;

  // `fn_decrypt_oauth(ciphertext bytea)` — UM argumento, e é o texto cifrado.
  //
  // Aqui se pedia `p_organization_id` e `p_integration_id`, que não existem em
  // assinatura nenhuma: o PostgREST devolvia "função não encontrada", a
  // credencial voltava nula e o catálogo ficava vazio pelo mesmo silêncio que
  // esta correção veio matar — um nível abaixo. Quem escondeu isso do
  // compilador foi o `as never`, por isso ele saiu junto.
  //
  // O mesmo padrão está em `webhooks/nuvemshop/[event]/route.ts` e em
  // `lib/webhooks/secrets.ts`.
  const cifrado = (data as { oauth_access_token_encrypted: string | null })
    .oauth_access_token_encrypted;
  if (!cifrado) return null;
  const { data: decrypted, error: decErr } = await admin.rpc("fn_decrypt_oauth", {
    ciphertext: cifrado,
  });

  if (decErr || !decrypted) return null;
  const accessToken = String(decrypted);
  return accessToken ? { accessToken, storeId } : null;
}
