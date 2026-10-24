/**
 * O dono do `state` AINDA é admin desta organização?
 *
 * O `state` vale 10 minutos e carrega o `userId` de quem iniciou. Quem foi
 * rebaixado (ou removido) nesse intervalo não pode concluir uma troca de token da
 * organização. A checagem é na VOLTA, antes de queimar o nonce, porque o
 * callback é público (a identidade vem do `state`, não da sessão).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { roleAtLeast } from "@/lib/auth/types";

export async function aindaEAdminDaOrganizacao(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("user_organizations")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return roleAtLeast((data as { role: string | null }).role, "admin");
}
