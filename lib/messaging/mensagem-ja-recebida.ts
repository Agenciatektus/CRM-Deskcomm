/**
 * Dedup BARATO antes do INSERT de `messages` nos caminhos de ingestão.
 *
 * `messages_org_external_id_unique` é `DEFERRABLE INITIALLY DEFERRED`. Numa
 * reentrega do provedor, o INSERT da linha repetida NÃO falha na hora: roda os
 * gatilhos de `messages` inteiros (emissão do `message.received` que acorda a
 * IA, abertura de demanda, revisão de atendimento) e só estoura o `23505` no
 * COMMIT, que desfaz tudo. O resultado é correto, mas cada reentrega paga o
 * trabalho todo dos gatilhos à toa. `insert ... on conflict do nothing` não
 * resolve: o Postgres recusa constraint deferível como árbitro do ON CONFLICT.
 *
 * Esta leitura usa a MESMA chave da constraint — `(organization_id,
 * external_id)`, o próprio índice dela — e, se a linha já existe, o chamador
 * devolve o mesmo desfecho que o 23505 daria (`duplicate`).
 *
 * A constraint continua sendo a rede: ler-e-depois-gravar tem janela, duas
 * entregas simultâneas podem passar as duas pela leitura, e quem perde a
 * corrida recebe o 23505 no COMMIT como antes. Por isso a leitura é FAIL-OPEN:
 * erro ou exceção ⇒ `false` e o INSERT decide. Ela nunca faz perder mensagem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `true` só quando a leitura AFIRMA que já existe linha com esse `external_id`
 * na organização (qualquer direção: é o que a constraint compara). Sem
 * `external_id` (a constraint não compara nulo) ou com a leitura falhando,
 * `false`.
 */
export async function mensagemJaRecebida(
  admin: Pick<SupabaseClient, "from">,
  organizationId: string,
  externalId: string | null | undefined,
): Promise<boolean> {
  if (!externalId) return false;
  try {
    const { data, error } = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("external_id", externalId)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return data != null;
  } catch {
    return false;
  }
}
