import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { contactMayBeProspected } from "@/lib/prospecting/guard";
import { cadenceSettingsSchema, type CadenceSettings } from "./settings";
import { OUTCOME_DA_SAIDA, type FatosDaSaida, type MotivoDeSaida } from "./saidas";

/**
 * O QUE O WORKER PRECISA SABER ANTES DE MANDAR UM PASSO DA RÉGUA.
 *
 * Tudo relido NA HORA do envio, do banco, com a organização do JOB (fonte
 * confiável) — nunca do payload. Pausar a cadência, pausar todas as cadências
 * da organização (kill switch) ou o contato pedir para sair valem para o
 * próximo envio, não para a próxima inscrição.
 *
 * Serve as DUAS superfícies de prospecção: a cadência do funil (`cadence`) e os
 * passos da campanha (`campaign`, migration 9035). O kill switch
 * `cadencias_pausadas` vale para as duas de propósito: ele é o freio de
 * emergência da prospecção automática da organização, e uma campanha com régua
 * é exatamente isso.
 */
export interface CadenciaDoEnvio {
  pointerId: string;
  /** O número principal da régua. */
  channelSessionId: string;
  /**
   * Os números por onde esta régua pode falar. Na cadência é um só; na campanha
   * é o POOL do rodízio (migration 0377), porque a 1ª mensagem pode ter saído
   * por um número secundário e a conversa do inscrito nasceu nele. Sem isto, o
   * passo 2 de quem foi atendido pelo número secundário seria pulado para
   * sempre com "a conversa deste contato é de outro número" — uma campanha com
   * rodízio e passos entregaria a régua só a uma fração da lista.
   */
  numerosPermitidos: string[];
  settings: CadenceSettings;
  /** `channel_sessions.daily_message_limit` — o teto que passa a valer na cadeia. */
  limiteDiario: number;
  /** Régua publicada (`active`)? Rascunho/desligada não envia. */
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
    numeros_da_campanha: string[] | null;
  }>(
    `select p.id, p.status, p.channel_session_id, p.cadence_settings,
            cs.daily_message_limit,
            coalesce((o.settings ->> 'cadencias_pausadas')::boolean, false) as pausada,
            case when p.surface = 'campaign' then (
              select array_agg(ccs.channel_session_id)
                from campaigns ca
                join campaign_channel_sessions ccs
                  on ccs.campaign_id = ca.id and ccs.organization_id = ca.organization_id
               where ca.organization_id = p.organization_id and ca.followup_pointer_id = p.id
            ) end as numeros_da_campanha
       from followup_flow_pointers p
       join organizations o on o.id = p.organization_id
       left join channel_sessions cs
         on cs.id = p.channel_session_id and cs.organization_id = p.organization_id
      where p.organization_id = $1 and p.id = $2 and p.surface in ('cadence', 'campaign')
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
    numerosPermitidos: [...new Set([row.channel_session_id, ...(row.numeros_da_campanha ?? [])])],
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
          where d.organization_id = $1 and d.id <> $2 and d.phone_number = any($3::text[])
            and (coalesce(d.is_blocked, false) or coalesce(d.is_anonymized, false)
                 or coalesce(d.consent -> 'marketing' ->> 'declined_at', '') <> '')
       ) as existe`,
      // Variantes com e sem o nono dígito: a mesma pessoa gravada de dois jeitos.
      [organizationId, contactId, phoneLookupVariants(c.phone_number)],
    );
    if (suprimidos[0]?.existe) return { apto: false, motivo: "telefone_suprimido" };
  }
  return { apto: true, telefone: c.phone_number };
}

/**
 * ESTA INSCRIÇÃO já mandou alguma mensagem? A 1ª mensagem da cadência leva o
 * rodapé de saída — e a pergunta é sobre a RÉGUA, não sobre a conversa: um
 * contato que já trocou mensagens com o número por outro motivo recebe a
 * primeira abordagem da cadência também com o aviso de como sair.
 */
export async function inscricaoJaEnviou(
  db: Queryable,
  organizationId: string,
  enrollmentId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ existe: boolean }>(
    `select exists(
       select 1 from followup_enrollment_events
        where organization_id = $1 and enrollment_id = $2 and event_type = 'action_sent'
     ) as existe`,
    [organizationId, enrollmentId],
  );
  return rows[0]?.existe === true;
}

/**
 * Os fatos que decidem a SAÍDA da régua, relidos do banco no instante do envio
 * (ver `lib/cadencia/saidas.ts`). `null` quando a inscrição não é desta
 * organização ou já não está viva — quem chama não tem o que encerrar.
 */
export async function fatosDaSaidaDaInscricao(
  db: Queryable,
  organizationId: string,
  enrollmentId: string,
): Promise<FatosDaSaida | null> {
  const { rows } = await db.query<{
    nasceu_com_negocio: boolean;
    tem_lead: boolean;
    stage_id: string | null;
    status: string | null;
    tags_lead: string[] | null;
    tags_contato: string[] | null;
    humano: boolean;
  }>(
    `select e.lead_id is not null as nasceu_com_negocio,
            e.lead_id is not null and l.id is not null as tem_lead,
            l.stage_id, l.status, l.tags as tags_lead, c.tags as tags_contato,
            exists(
              select 1
                from conversations cv
                join messages m on m.conversation_id = cv.id and m.organization_id = cv.organization_id
               where cv.organization_id = e.organization_id
                 and cv.contact_id = e.contact_id
                 and m.direction = 'outbound'
                 and m.sent_by_user_id is not null
                 and m.created_at > e.started_at
            ) as humano
       from followup_enrollments e
       join contacts c on c.id = e.contact_id and c.organization_id = e.organization_id
       left join crm_leads l on l.id = e.lead_id and l.organization_id = e.organization_id
      where e.organization_id = $1 and e.id = $2
        and e.status in ('active','waiting_reply','dormente','paused_handoff','paused_manual')`,
    [organizationId, enrollmentId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    lead: r.tem_lead
      ? { stage_id: r.stage_id as string, status: r.status as string, tags: r.tags_lead ?? [] }
      : null,
    // `lead_id` preenchido com a linha ausente = negócio APAGADO. Sem `lead_id`
    // = inscrição que nunca teve negócio (régua de campanha cujo card não deu).
    nasceuComNegocio: r.nasceu_com_negocio === true,
    tagsDoContato: r.tags_contato ?? [],
    humanoFalouDepois: r.humano === true,
  };
}

/**
 * Encerra a inscrição pela saída. O update direto é seguro contra o motor: a
 * trigger `trg_followup_revision` avança a `revision`, e a escrita atrasada de
 * quem estava com a inscrição em mãos cai no CAS (`followup_stale`) em vez de
 * ressuscitá-la. Idempotente: só encerra o que ainda está vivo.
 */
export async function encerrarInscricaoPorSaida(
  db: Queryable,
  organizationId: string,
  enrollmentId: string,
  motivo: MotivoDeSaida,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `update followup_enrollments
        set status = 'cancelled', outcome = $3, cancel_reason = $4,
            next_eval_at = null, claimed_until = null,
            completed_at = now(), updated_at = now()
      where organization_id = $1 and id = $2
        and status in ('active','waiting_reply','dormente','paused_handoff','paused_manual')
      returning id`,
    [organizationId, enrollmentId, OUTCOME_DA_SAIDA[motivo], motivo],
  );
  return rows.length > 0;
}
