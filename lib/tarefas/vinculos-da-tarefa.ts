import type { SupabaseClient } from "@supabase/supabase-js";

/** O que a rota recusa, e em qual campo; `null` = os vínculos são da organização. */
export type RecusaDeVinculo = { campo: "lead_id" | "contact_id"; mensagem: string } | null;

interface Vinculos {
  lead_id?: string | null;
  contact_id?: string | null;
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
 * explícito: o que a pessoa não enxerga também não se vincula. O responsável
 * (`assigned_to`) é conferido pelas rotas ANTES daqui, por `conferirResponsavel`
 * (`lib/tarefas/responsavel.ts`), com a mesma régua e o mesmo porquê do admin
 * client.
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
  // `assigned_to` NÃO é conferido aqui: as rotas já o conferem antes, por
  // `conferirResponsavel` (`lib/tarefas/responsavel.ts`, a mesma régua: membro
  // ativo e não `viewer`), e conferir duas vezes era uma leitura a mais de
  // `user_organizations` por tarefa salva.
  return null;
}
