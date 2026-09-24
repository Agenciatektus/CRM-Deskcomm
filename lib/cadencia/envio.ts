import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { contactMayBeProspected } from "@/lib/prospecting/guard";
import { cadenceSettingsSchema, type CadenceSettings } from "./settings";

/**
 * O QUE O WORKER PRECISA SABER ANTES DE MANDAR UM PASSO DA CADÊNCIA.
 *
 * Tudo relido NA HORA do envio, do banco, com a organização do JOB (fonte
 * confiável) — nunca do payload. Pausar a cadência, pausar todas as cadências
 * da organização (kill switch) ou o contato pedir para sair valem para o
 * próximo envio, não para a próxima inscrição.
 */
export interface CadenciaDoEnvio {
  pointerId: string;
  /** O número da cadência. A conversa do job TEM de ser neste número. */
  channelSessionId: string;
  settings: CadenceSettings;
  /** `channel_sessions.daily_message_limit` — o teto que passa a valer na cadeia. */
  limiteDiario: number;
  /** Cadência publicada (`active`)? Rascunho/desligada não envia. */
  ativa: boolean;
  /** Kill switch da organização: `organizations.settings.cadencias_pausadas`. */
  pausadaNaOrg: boolean;
}

export async function carregarCadenciaDoEnvio(
  db: Queryable,
  organizationId: string,
  pointerId: string,
): Promise<CadenciaDoEnvio | null> {
  const { rows } = await db.query<{
    id: string;
    status: string;
    channel_session_id: string | null;
    cadence_settings: unknown;
    daily_message_limit: number | null;
    pausada: boolean | null;
  }>(
    `select p.id, p.status, p.channel_session_id, p.cadence_settings,
            cs.daily_message_limit,
            coalesce((o.settings ->> 'cadencias_pausadas')::boolean, false) as pausada
       from followup_flow_pointers p
       join organizations o on o.id = p.organization_id
       left join channel_sessions cs
         on cs.id = p.channel_session_id and cs.organization_id = p.organization_id
      where p.organization_id = $1 and p.id = $2 and p.surface = 'cadence'
      limit 1`,
    [organizationId, pointerId],
  );
  const row = rows[0];
  if (!row || !row.channel_session_id) return null;
  const settings = cadenceSettingsSchema.safeParse(row.cadence_settings);
  if (!settings.success) return null;
  return {
    pointerId: row.id,
    channelSessionId: row.channel_session_id,
    settings: settings.data,
    limiteDiario: row.daily_message_limit ?? 0,
    ativa: row.status === "active",
    pausadaNaOrg: row.pausada === true,
  };
}

export type AptidaoDoContato =
  | { apto: true; telefone: string | null }
  | { apto: false; motivo: "contato_indisponivel" | "sem_base_legal_ou_optout" | "telefone_suprimido" };

/**
 * O contato pode receber prospecção AGORA?
 *
 * 1. `contactMayBeProspected` — bloqueado, travado para humano, anonimizado,
 *    recusa de marketing ou sem base legal (a mesma régua da prospecção nativa);
 * 2. supressão por TELEFONE — qualquer OUTRO contato da organização com o mesmo
 *    número bloqueado, anonimizado ou com recusa de marketing também barra. O
 *    opt-out é da PESSOA, não da linha de cadastro: com duplicata (importação,
 *    formatação diferente), barrar só a linha deixava a outra receber.
 */
export async function aptidaoDoContatoParaCadencia(
  db: Queryable,
  organizationId: string,
  contactId: string,
): Promise<AptidaoDoContato> {
  const { rows } = await db.query<{
    is_blocked: boolean | null;
    force_human: boolean | null;
    is_anonymized: boolean | null;
    source: string | null;
    consent: Record<string, unknown> | null;
    phone_number: string | null;
  }>(
    `select is_blocked, force_human, is_anonymized, source, consent, phone_number
       from contacts where organization_id = $1 and id = $2`,
    [organizationId, contactId],
  );
  const c = rows[0];
  if (!c) return { apto: false, motivo: "contato_indisponivel" };
  if (
    !contactMayBeProspected({
      is_blocked: c.is_blocked ?? false,
      force_human: c.force_human ?? false,
      is_anonymized: c.is_anonymized ?? false,
      source: c.source,
      consent: c.consent,
    })
  ) {
    return { apto: false, motivo: "sem_base_legal_ou_optout" };
  }
  if (c.phone_number) {
    const { rows: suprimidos } = await db.query<{ existe: boolean }>(
      `select exists(
         select 1 from contacts d
          where d.organization_id = $1 and d.id <> $2 and d.phone_number = $3
            and (coalesce(d.is_blocked, false) or coalesce(d.is_anonymized, false)
                 or coalesce(d.consent -> 'marketing' ->> 'declined_at', '') <> '')
       ) as existe`,
      [organizationId, contactId, c.phone_number],
    );
    if (suprimidos[0]?.existe) return { apto: false, motivo: "telefone_suprimido" };
  }
  return { apto: true, telefone: c.phone_number };
}

/** A conversa já teve alguma mensagem SAINDO? (a 1ª da cadência leva o rodapé de saída). */
export async function conversaJaTeveEnvio(
  db: Queryable,
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ last_outbound_at: string | null }>(
    `select last_outbound_at from conversations where organization_id = $1 and id = $2`,
    [organizationId, conversationId],
  );
  return rows[0]?.last_outbound_at != null;
}
