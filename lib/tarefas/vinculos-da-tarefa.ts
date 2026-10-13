import type { SupabaseClient } from "@supabase/supabase-js";

import { isServiceRoleConfigured } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/** O que a rota recusa, e em qual campo; `null` = os vínculos são da organização. */
export type RecusaDeVinculo = { campo: "lead_id" | "contact_id" | "assigned_to"; mensagem: string } | null;

interface Vinculos {
  lead_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;
}

/**
 * Os vínculos de uma tarefa pertencem à organização da SESSÃO?
 *
 * ⚠️ POR QUE A ROTA PRECISA DISTO, E A RLS NÃO BASTA. `lead_id`, `contact_id` e
 * `assigned_to` de `crm_tasks` são FKs simples (migration 0210), e a checagem de
 * FK do Postgres NÃO passa por RLS: ela só pergunta "a linha existe?", em
 * qualquer organização. Sem esta leitura, um `agent` da organização A gravava
 * tarefa apontando para o contato ou o negócio da organização B, ou atribuía a
 * qualquer usuário do `auth.users`, e o 23503 só aparecia para uuid que não
 * existe em lugar nenhum. É o mesmo filtro de `criarTarefaInterna`.
 *
 * Negócio e contato são lidos pelo client DA SESSÃO, com `organization_id`
 * explícito: o que a pessoa não enxerga também não se vincula. O responsável é
 * lido em `user_organizations` (ativo e `agent`+) pelo admin client, filtrado pela org resolvida no
 * servidor, porque a RLS dessa tabela mostra a um `agent` só o próprio vínculo
 * (o mesmo motivo de `GET /api/v1/team/assignable`). Sem service role, cai no
 * client da sessão, e atribuir a outra pessoa é recusado em vez de aceito às
 * cegas: fechar por falta de prova, não abrir.
 */
export async function recusaDeVinculoDaTarefa(
  db: SupabaseClient,
  orgId: string,
  vinculos: Vinculos,
  t: (texto: string) => string,
): Promise<RecusaDeVinculo> {
  if (vinculos.lead_id) {
    const { data } = await db
      .from("crm_leads")
      .select("id")
      .eq("id", vinculos.lead_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!data) return { campo: "lead_id", mensagem: t("O negócio vinculado não existe nesta organização.") };
  }
  if (vinculos.contact_id) {
    const { data } = await db
      .from("contacts")
      .select("id")
      .eq("id", vinculos.contact_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!data) return { campo: "contact_id", mensagem: t("O contato vinculado não existe nesta organização.") };
  }
  if (vinculos.assigned_to) {
    const membros = isServiceRoleConfigured() ? createAdminClient() : db;
    const { data } = await membros
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", vinculos.assigned_to)
      .is("revoked_at", null)
      // A MESMA régua de `GET /api/v1/team/assignable`: `viewer` não atende, e
      // tarefa atribuída a quem não pode concluí-la (a rota exige `agent`) é
      // lembrete que ninguém fecha.
      .neq("role", "viewer")
      .maybeSingle();
    if (!data) return { campo: "assigned_to", mensagem: t("O responsável não é membro desta organização.") };
  }
  return null;
}
