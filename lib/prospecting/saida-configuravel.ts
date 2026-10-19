/**
 * Contagem e reserva da saída ("responda PARAR") na prospecção.
 *
 * O `update` atômico abaixo incrementa `automatic_sends` e, se for a vez
 * (`automatic_sends + 1 >= alvo` do modo da campanha e `exit_offered_at is null`),
 * grava `exit_offered_at = now()`. A CTE `antes` captura o valor anterior de
 * `exit_offered_at` para que o código saiba se ESTE envio é quem reserva — sem
 * confiar em `now()` ser idêntico ao do banco.
 *
 * Toda consulta filtra `organization_id`, resolvido da linha do job / da fonte
 * confiável, nunca do corpo de requisição.
 */
import type { Queryable } from "@/lib/agent-engine/queue/queue";

export interface ContagemSaida {
  candidatoId: string;
  campanhaId: string;
  levaASaida: boolean;
  /** Só preenchido quando ESTE envio reservou (levaASaida === true). */
  reservadaEm: string | null;
  locale: string | null;
  /** Número automático desta mensagem para o candidato (após o incremento). */
  numeroDaMensagem: number;
}

interface LinhaContagem {
  candidato_id: string;
  campanha_id: string;
  exit_offered_at: Date | null;
  leva_a_saida: boolean;
  numero_da_mensagem: number;
  locale: string | null;
  reservada_em_texto: string | null;
}

/** Texto do `update` atômico que conta a mensagem e, se for a vez, reserva a saída. Params: ($1 = organization_id, $2 = conversation_id). */
export const SQL_CONTAR_ENVIO_AUTOMATICO = `
    with antes as (
      select id, campaign_id, exit_offered_at
      from public.prospecting_candidates
      where organization_id = $1 and conversation_id = $2
        and status in ('sending', 'sent')
      for update
    )
    update public.prospecting_candidates p
       set automatic_sends = p.automatic_sends + 1,
           exit_offered_at = case
             when p.exit_offered_at is null
              and p.automatic_sends + 1 >= (case c.config->>'exit_offer'
                                              when 'second_message' then 2
                                              when 'third_message'  then 3 end)
             then now() else p.exit_offered_at end,
           updated_at = now()
      from public.prospecting_campaigns c, antes
     where p.organization_id = $1
       and p.conversation_id = $2
       and p.status in ('sending', 'sent')
       and antes.id = p.id
       and c.organization_id = p.organization_id
       and c.id = p.campaign_id
       and c.config->>'exit_offer' in ('second_message', 'third_message')
    returning p.id as candidato_id,
              p.campaign_id as campanha_id,
              p.exit_offered_at,
              (antes.exit_offered_at is null and p.exit_offered_at is not null) as leva_a_saida,
              p.automatic_sends as numero_da_mensagem,
              (select o.locale from public.organizations o where o.id = $1) as locale,
              p.exit_offered_at::text as reservada_em_texto
`;

/** Texto do `update` que desfaz a contagem e a reserva de um envio falhado. Params: ($1 = organization_id, $2 = candidato_id, $3 = reservadaEm). */
export const SQL_DESFAZER_CONTAGEM = `
    update public.prospecting_candidates
       set automatic_sends = greatest(automatic_sends - 1, 0),
           exit_offered_at = case when exit_offered_at = $3::timestamptz then null else exit_offered_at end,
           updated_at = now()
     where organization_id = $1 and id = $2
`;

/**
 * Conta este envio automático e, se for a vez, reserva a saída.
 *
 * Retorna `null` quando não há candidato em `sending`/`sent` nesta conversa
 * desta organização (linha antiga, modo `first_message`/`off`, ou conversa
 * de outra organização).
 */
export async function contarEnvioAutomatico(
  db: Queryable,
  org: string,
  conversationId: string,
): Promise<ContagemSaida | null> {
  const { rows } = await db.query<LinhaContagem>(SQL_CONTAR_ENVIO_AUTOMATICO, [org, conversationId]);
  const linha = rows[0];
  if (!linha) return null;
  return {
    candidatoId: linha.candidato_id,
    campanhaId: linha.campanha_id,
    levaASaida: !!linha.leva_a_saida,
    // A reserva só existe se este envio foi quem a fez. Usa o texto do Postgres
    // (com microssegundos) para que a comparação exata no desfazer não falhe.
    reservadaEm: linha.leva_a_saida ? linha.reservada_em_texto ?? null : null,
    locale: linha.locale ?? null,
    numeroDaMensagem: linha.numero_da_mensagem,
  };
}

/**
 * Desfaz a contagem e a reserva de um envio automático que falhou.
 *
 * Devolve a contagem (piso zero) e, se `reservadaEm` bater com o
 * `exit_offered_at` gravado, volta a reserva a null.
 */
export async function desfazerContagem(
  db: Queryable,
  org: string,
  candidatoId: string,
  reservadaEm: string | null,
): Promise<void> {
  await db.query(SQL_DESFAZER_CONTAGEM, [org, candidatoId, reservadaEm]);
}
