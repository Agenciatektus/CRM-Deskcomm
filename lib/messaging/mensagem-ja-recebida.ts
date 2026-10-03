/**
 * Dedup BARATO antes do INSERT de `messages` nos caminhos de ingestão.
 *
 * Por que existe: `messages_org_external_id_unique` é `DEFERRABLE INITIALLY
 * DEFERRED`. Numa reentrega do provedor, o INSERT da linha repetida NÃO falha na
 * hora: roda os triggers de `messages` inteiros e só estoura o `23505` no COMMIT.
 * Medido em 30/09/2026: ~1,7 mil duplicatas/dia a ~466 ms cada, gastos à toa
 * no banco nano. `insert ... on conflict do nothing` não resolve: o Postgres
 * recusa constraint deferível como árbitro do ON CONFLICT
 * ("ON CONFLICT does not support deferrable unique constraints").
 *
 * O que esta função faz: um SELECT por `(organization_id, external_id)` — o
 * próprio índice da constraint — e, se a linha já existe, devolve o MESMO
 * desfecho que o INSERT devolveria (`error.code = "23505"`). Cada caminho de
 * ingestão segue tratando o 23505 como sempre tratou; a semântica de "já
 * recebida" não muda, só fica mais barata.
 *
 * A constraint continua sendo a rede: a leitura é check-then-act, então duas
 * entregas simultâneas podem passar as duas pela leitura, e quem perde a corrida
 * recebe o 23505 do banco, como antes. Por isso a leitura é FAIL-OPEN: erro ou
 * exceção na leitura ⇒ segue para o INSERT. Nunca perde mensagem por causa dela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** O desfecho sintético: mesma forma que o PostgREST devolve no 23505. */
export type DuplicadaPelaLeitura = {
  data: null;
  error: { code: "23505"; message: string; details: string; hint: string };
};

export const DUPLICADA_PELA_LEITURA: DuplicadaPelaLeitura = Object.freeze({
  data: null,
  error: Object.freeze({
    code: "23505" as const,
    message: "messages_org_external_id_unique: external_id já recebido (dedup antes do insert)",
    details: "",
    hint: "",
  }),
}) as DuplicadaPelaLeitura;

/**
 * `true` só quando a leitura AFIRMA que existe linha com esse `external_id` na
 * organização (qualquer direção — é o que a constraint compara). Sem
 * `external_id`, ou com a leitura falhando, `false`: o INSERT decide.
 */
export async function mensagemJaRecebida(
  admin: SupabaseClient,
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
