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
import { audit } from "@/lib/audit";
import type { ChannelSendResult } from "@/lib/agent-engine/channel-adapter";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { comSaida, temSaida } from "@/lib/prospecting/rodape-de-saida";

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
                                              when 'second_message' then 2 end)
             then now() else p.exit_offered_at end,
           updated_at = now()
      from public.prospecting_campaigns c, antes
     where p.organization_id = $1
       and p.conversation_id = $2
       and p.status in ('sending', 'sent')
       and antes.id = p.id
       and c.organization_id = p.organization_id
       and c.id = p.campaign_id
       and c.config->>'exit_offer' = 'second_message'
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
 * A mensagem desta intenção (job, seq) já foi guardada por uma tentativa
 * anterior: `queued` (o canal a segura e a entrega depois) ou `accepted` (já
 * saiu). A tentativa que a guardou já contou, já reservou e já auditou; esta é
 * reprocesso da MESMA mensagem. Params: ($1 = organization_id, $2 = job_id, $3 = seq).
 */
export const SQL_MENSAGEM_GUARDADA = `
    select m.body, o.locale
      from public.send_ledger l
      join public.organizations o on o.id = l.organization_id
      left join public.messages m on m.organization_id = l.organization_id and m.id = l.crm_message_id
     where l.organization_id = $1 and l.job_id = $2 and l.seq = $3
       and l.status in ('queued', 'accepted')
`;

/**
 * Conta este envio automático e, se for a vez, reserva a saída.
 *
 * Retorna `null` quando não há candidato em `sending`/`sent` nesta conversa
 * desta organização (linha antiga, modo `first_message`, ou conversa
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

export interface OpcoesDaSaida {
  db: Queryable;
  organizationId: string;
  /** null/undefined = não conta (prévia, template, conversa ausente): envia o corpo como veio. */
  conversationId: string | null | undefined;
  via: "inbound_turn" | "followup";
  /**
   * A intenção do envio no ledger: o job e o `seq` da 1ª mensagem física. É a
   * chave que faz a contagem valer uma vez por MENSAGEM e não por tentativa.
   */
  mensagem: { jobId: string; seq: number };
  avisar: (mensagem: string, contexto: Record<string, unknown>) => void;
}

/**
 * Envolve UM envio automático com a saída configurável: conta a mensagem e, se
 * for a vez, cola a saída no corpo; se a mensagem não vai sair (ou o envio
 * lançar), desfaz a contagem; se saiu ou ficou guardada para sair (`queued`) e
 * levou a saída, audita `prospecting.exit_offered`.
 * Falha da contagem nunca derruba o envio: segue sem a saída.
 */
export async function enviarComSaidaConfiguravel(
  opcoes: OpcoesDaSaida,
  corpo: string,
  enviar: (corpo: string) => Promise<ChannelSendResult>,
): Promise<ChannelSendResult> {
  const { db, organizationId, conversationId, via, mensagem } = opcoes;
  let r: ContagemSaida | null = null;
  if (conversationId) {
    try {
      const { rows: guardada } = await db.query<{ body: string | null; locale: string | null }>(
        SQL_MENSAGEM_GUARDADA,
        [organizationId, mensagem.jobId, mensagem.seq],
      );
      if (guardada[0]) {
        // Reprocesso da mesma mensagem (o follow-up reagenda o `queued`; o turno
        // re-roda depois de um crash): não conta de novo, e repete a decisão que
        // está no corpo guardado — o canal transmite o corpo DESTA tentativa, e
        // ele tem de dizer o mesmo que a tela e a contagem já dizem.
        // ponytail: a decisão vem da 1ª mensagem física; numa resposta fatiada
        // em bolhas o rodapé mora na última, e o reprocesso sai sem ele.
        const { body, locale } = guardada[0];
        if (body !== null && temSaida(body, locale)) corpo = comSaida(corpo, locale);
      } else {
        r = await contarEnvioAutomatico(db, organizationId, conversationId);
        if (r?.levaASaida) corpo = comSaida(corpo, r.locale);
      }
    } catch (erroContagem) {
      opcoes.avisar("contagem de saída automática falhou; segue sem a saída", {
        error: erroContagem instanceof Error ? erroContagem.message.slice(0, 200) : String(erroContagem),
      });
    }
  }
  let resultado: ChannelSendResult;
  try {
    resultado = await enviar(corpo);
  } catch (erroEnvio) {
    if (r) await desfazerContagem(db, organizationId, r.candidatoId, r.reservadaEm).catch(() => {});
    throw erroEnvio;
  }
  if (r) {
    // A contagem vale uma vez por MENSAGEM que vai sair, não por tentativa.
    // `queued` FICA: o corpo guardado, já com o rodapé, sai depois — pelo
    // watchdog (`redriveQueued`, que transmite `messages.body` sem passar por
    // aqui; no inbound_turn o `queued` encerra o turno) ou pela nova tentativa
    // do mesmo job, que acha a mensagem guardada acima e não conta de novo.
    // Desfazer no `queued` (como antes) deixava o contato recebendo o PARAR com
    // a contagem em 1 e a reserva nula — e a mensagem seguinte o levava outra vez.
    // Desfaz quando a mensagem NÃO vai sair (failed, blocked, unavailable) e no
    // `already_sent`, que não transmitiu nada.
    if (resultado.kind !== "sent" && resultado.kind !== "queued") {
      await desfazerContagem(db, organizationId, r.candidatoId, r.reservadaEm).catch(() => {});
    } else if (r.levaASaida) {
      void audit({
        action: "prospecting.exit_offered",
        organizationId,
        bypassedRls: true,
        resourceType: "prospecting_candidate",
        resourceId: r.candidatoId,
        metadata: {
          campaign_id: r.campanhaId,
          conversation_id: conversationId,
          message_number: r.numeroDaMensagem,
          via,
        },
      });
    }
  }
  return resultado;
}
