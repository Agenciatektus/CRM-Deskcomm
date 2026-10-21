/**
 * Ler o estado de elegibilidade de uma conversa via pool `pg` (o transporte do
 * agent-engine). Uma query, três tabelas: o modo do gate do canal, as travas do
 * contato, o silêncio da conversa.
 *
 * O drain (decide ENFILEIRAR) e o turno (decide RODAR) chamam isto e passam o
 * resultado para `decidirElegibilidade` — a MESMA regra pura.
 */
import type pg from "pg";

import {
  decidirElegibilidade,
  montarEstadoDeElegibilidade,
  type DecisaoDeElegibilidade,
} from "./gate";

interface LinhaDeElegibilidade {
  channel_metadata: Record<string, unknown> | null;
  force_human: boolean;
  ai_opt_out: boolean;
  assignee_kind: string | null;
  bot_silenced_until: Date | string | null;
  ai_authorized_at: Date | string | null;
  phone_number: string | null;
  org_status: string | null;
  /** `bool_and` dos agentes da sessão: `null` quando não há nenhum. */
  so_organiza: boolean | null;
}

/**
 * Roda a query e a regra. `null` = conversa não encontrada (deixe o chamador
 * decidir; o drain trata como "sem gate", segue o fluxo antigo).
 */
export async function decidirElegibilidadeDaConversa(
  pool: pg.Pool,
  input: { organizationId: string; conversationId: string; agora: Date; ttlMs: number },
): Promise<DecisaoDeElegibilidade | null> {
  const { rows } = await pool.query<LinhaDeElegibilidade>(
    `select
       cs.metadata                  as channel_metadata,
       ct.force_human               as force_human,
       ct.ai_opt_out                as ai_opt_out,
       cv.assignee_kind             as assignee_kind,
       cv.bot_silenced_until        as bot_silenced_until,
       ct.ai_authorized_at          as ai_authorized_at,
       ct.phone_number              as phone_number,
       o.status                     as org_status,
       -- SÓ LIBERA QUANDO TODO MUNDO QUE PODERIA ATENDER É AUXILIAR DE CRM.
       -- Com um agente que fala entre os candidatos, a conversa assumida
       -- continua protegida. E bool_and sobre conjunto vazio devolve null, que
       -- o montador lê como \"não\": sessão sem agente publicado também não
       -- ganha liberação nenhuma.
       (select bool_and(v.somente_interno)
          from ai_agents a
          join ai_agent_versions v on v.id = a.published_version_id
         where a.organization_id = cv.organization_id
           and a.archived_at is null
           and a.is_active
           and a.paused_at is null
           and v.channel_session_id = cv.channel_session_id) as so_organiza
     from conversations cv
     join organizations o on o.id = cv.organization_id
     join contacts ct
       on ct.id = cv.contact_id and ct.organization_id = cv.organization_id
     join channel_sessions cs
       on cs.id = cv.channel_session_id and cs.organization_id = cv.organization_id
     where cv.organization_id = $1 and cv.id = $2`,
    [input.organizationId, input.conversationId],
  );
  const r = rows[0];
  if (r === undefined) return null;

  return decidirElegibilidade(
    montarEstadoDeElegibilidade({
      orgStatus: r.org_status,
      canalDesativado: r.channel_metadata?.disabled,
      aiGate: r.channel_metadata?.ai_gate,
      aiGateMode: r.channel_metadata?.ai_gate_mode,
      aiTestPhoneNumbers: r.channel_metadata?.ai_test_phone_numbers,
      contactPhoneNumber: r.phone_number,
      forceHuman: r.force_human,
      aiOptOut: r.ai_opt_out,
      assigneeKind: r.assignee_kind,
      botSilencedUntil: r.bot_silenced_until,
      aiAuthorizedAt: r.ai_authorized_at,
      agora: input.agora,
      ttlMs: input.ttlMs,
      agenteSomenteInterno: r.so_organiza,
    }),
  );
}
