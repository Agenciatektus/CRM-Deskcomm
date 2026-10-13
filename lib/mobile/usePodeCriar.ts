"use client";
import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { roleAtLeast } from "@/lib/auth/types";

/**
 * Quem pode CRIAR contato, lead e tarefa: a mesma régua do servidor
 * (`POST /api/v1/contacts` e `/leads` exigem `agent` e recusam o suporte somente
 * leitura por `requireSupportWrite`; a tela de tarefas usa `agent` ou admin da
 * plataforma fora do suporte). Esconde o FAB e ignora o `?criar=1` de quem não pode,
 * para não oferecer um botão que termina em 403.
 */
export function usePodeCriar(): boolean {
  const user = useUser();
  const activeOrg = useActiveOrg();
  if (user.support?.access_mode === "support_readonly") return false;
  return (user.is_platform_admin && !user.support) || roleAtLeast(activeOrg?.role, "agent");
}
