-- 9054: cada ETAPA do funil decide se envia evento de conversão (Meta/Google) ao receber um negócio.
--
-- Prova: tests/invariants/conversao-por-etapa-9054.test.ts (backfill preserva o
-- comportamento, recompra aceita só entrada mais nova, viewer não emite lead.*).
-- Ordem do deploy: migration ANTES do app (o app novo lê as colunas novas e,
-- sem elas, nenhuma conversão sai).
set lock_timeout = '3s';

-- ---- cada etapa decide se envia conversão ao receber um negócio (migration 9054) ----
--
-- Decisão do Peterson (19/10/2026): a chave "Enviar evento de conversão (Meta/Google)
-- ao entrar nesta etapa" é POR ETAPA, desligada por padrão numa etapa nova. Até aqui
-- a compra saía de todo negócio ganho (`status = 'won'`) e a etapa do Google saía
-- pela regra da etapa, uma vez por (negócio, evento): a recompra no mesmo card não
-- reenviava.
--
-- 1 · `crm_stages.envia_conversao` + `evento_de_conversao` (vocabulário fechado com
--     o que o sistema já sabe enviar: `Purchase`, a compra com valor para Meta e
--     Google; `QualifiedLead`, a conversão de etapa do Google, com a ação da regra
--     da etapa em `google_ads_conversion_rules`).
--     BACKFILL que PRESERVA o comportamento de hoje, só quando a coluna nasce
--     (reaplicar não desfaz o que a organização mudou): etapa de ganho → Purchase;
--     etapa aberta com regra do Google ligada → QualifiedLead; o resto desligado.
-- 2 · `ad_conversion_dispatches.entrada_em`: a entrada na etapa (o
--     `crm_leads.stage_changed_at`) que a linha representa. Idempotência por
--     ENTRADA: o `lead.won` e o `lead.stage_changed` do mesmo arrasto saem uma vez;
--     a recompra (carimbo mais novo) reabre a linha. `fn_preservar_conversao_enviada`
--     segue sem rebaixar `sent` da MESMA entrada e ignora escrita de entrada velha.
-- 3 · `fn_solicitar_reenvio_conversao`: a compra pode ser reenviada também quando o
--     negócio está numa etapa ligada com `Purchase` (não só ganho).
-- 4 · `emit_event` (P2 do Cassio na #207): `lead.*` dispara conversão, automação e
--     cadência; quem tem sessão precisa ser agent+ para emiti-los (viewer só lê).
--     `ad_conversion.*` passa a ser só do servidor (a RPC de reenvio roda como
--     service_role, sem `auth.uid()`). Corpo vigente (0279) + as duas travas.
--
-- Troca de funil (`fn_mover_lead_de_funil`) não emite evento de etapa, e a entrada
-- pedida pela opção da #207 é pulada pelos consumidores: nunca envia conversão.
-- Idempotente (`if not exists`, backfill só no nascimento, `create or replace`).

do $m$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'crm_stages'
                    and column_name = 'envia_conversao') then
    alter table public.crm_stages
      add column envia_conversao boolean not null default false,
      add column evento_de_conversao text;
    update public.crm_stages
       set envia_conversao = true, evento_de_conversao = 'Purchase'
     where is_won;
    update public.crm_stages s
       set envia_conversao = true, evento_de_conversao = 'QualifiedLead'
     where not s.is_won and not s.is_lost
       and exists (select 1 from public.google_ads_conversion_rules r
                    where r.organization_id = s.organization_id
                      and r.stage_id = s.id and r.enabled);
  end if;
end $m$;

alter table public.crm_stages drop constraint if exists crm_stages_evento_de_conversao_conhecido;
alter table public.crm_stages add constraint crm_stages_evento_de_conversao_conhecido
  check (evento_de_conversao is null or evento_de_conversao in ('Purchase', 'QualifiedLead'));
alter table public.crm_stages drop constraint if exists crm_stages_conversao_com_evento;
alter table public.crm_stages add constraint crm_stages_conversao_com_evento
  check (not envia_conversao or evento_de_conversao is not null);

comment on column public.crm_stages.envia_conversao is
  'Negócio que ENTRA nesta etapa envia o evento de conversão evento_de_conversao (Meta/Google). Padrão desligado (9054).';
comment on column public.crm_stages.evento_de_conversao is
  'Purchase (compra com valor, Meta e Google) ou QualifiedLead (conversão de etapa do Google, ação da regra da etapa) (9054).';

alter table public.ad_conversion_dispatches add column if not exists entrada_em timestamptz;
comment on column public.ad_conversion_dispatches.entrada_em is
  'A entrada na etapa (crm_leads.stage_changed_at) que esta linha representa. Mais nova reabre a linha: recompra envia de novo (9054).';

create or replace function public.fn_preservar_conversao_enviada()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Entrada mais velha que a da linha: escrita atrasada, ignorada.
  if new.entrada_em is not null and old.entrada_em is not null
     and new.entrada_em < old.entrada_em then
    return old;
  end if;
  -- Entrada NOVA (recompra): a linha recomeça, sem o retrato nem o protocolo da anterior.
  if new.entrada_em is not null
     and new.entrada_em > coalesce(old.entrada_em, old.created_at) then
    if new.remote_request_id is not distinct from old.remote_request_id then
      new.remote_request_id := null;
      new.remote_requested_at := null;
    end if;
    return new;
  end if;
  if old.status = 'sent' and new.status <> 'sent' then return old; end if;
  new.event_occurred_at := coalesce(old.event_occurred_at, new.event_occurred_at);
  new.google_action_id := coalesce(old.google_action_id, new.google_action_id);
  return new;
end;
$$;
revoke execute on function public.fn_preservar_conversao_enviada() from public, anon, authenticated;
grant execute on function public.fn_preservar_conversao_enviada() to service_role;

create or replace function public.fn_solicitar_reenvio_conversao(p_org uuid, p_lead uuid, p_event text)
returns boolean language plpgsql set search_path = public as $$
declare v_linha public.ad_conversion_dispatches%rowtype;
begin
  if p_event is null or not (p_event in ('Purchase', 'QualifiedLead') or p_event ~ '^Etapa:[0-9a-f-]{36}$') then
    return false;
  end if;
  select * into v_linha from public.ad_conversion_dispatches
    where organization_id = p_org and lead_id = p_lead and event_name = p_event for update;
  if not found or v_linha.status = 'sent' then return false; end if;
  if p_event <> 'Purchase' and (v_linha.event_occurred_at is null or v_linha.google_action_id is null) then return false; end if;
  if p_event = 'Purchase' and v_linha.remote_request_id is null and not exists (
    select 1 from public.crm_leads l
      left join public.crm_stages s on s.id = l.stage_id and s.organization_id = l.organization_id
     where l.id = p_lead and l.organization_id = p_org
       and (l.status = 'won' or (s.envia_conversao and s.evento_de_conversao = 'Purchase'))
  ) then return false; end if;
  if exists (select 1 from public.event_log where organization_id = p_org and entity_id = p_lead
    and event_type = 'ad_conversion.retry_requested' and status in ('pending', 'processing')
    and coalesce(payload->>'event_name', 'Purchase') = p_event) then return false; end if;
  perform public.emit_event('ad_conversion.retry_requested', 'crm_lead', p_lead,
    jsonb_build_object('event_name', p_event), '{}'::jsonb, p_org);
  update public.ad_conversion_dispatches set reason = 'reprocessamento_solicitado', attempted_at = now()
    where id = v_linha.id and organization_id = p_org;
  return true;
end;
$$;
revoke execute on function public.fn_solicitar_reenvio_conversao(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_solicitar_reenvio_conversao(uuid, uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.emit_event(p_event_type text, p_entity_kind text, p_entity_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_event_id uuid;
  v_contact uuid;
  v_origin jsonb;
begin
  -- message.received nasce somente do INSERT inbound interno. Um chamador
  -- público não pode reapresentar uma mensagem existente como evento novo.
  -- `ai.case_opened`/`ai.case_closed` entram pela mesma razão (0279): o caso é
  -- do motor, e um evento de caso forjado por login move o funil e acorda o
  -- agente em nome de uma decisão que ninguém tomou.
  if auth.uid() is not null and p_event_type in (
    'message.received','appointment.outcome_confirmed',
    'ai.case_opened','ai.case_closed'
  ) then
    raise exception 'reserved_message_received' using errcode='42501';
  end if;
  -- 9054: o reenvio de conversão nasce só do servidor (RPC como service_role).
  if auth.uid() is not null and p_event_type like 'ad\_conversion.%' then
    raise exception 'reserved_server_event' using errcode='42501';
  end if;
  -- Estes campos autorizam efeitos operacionais; não são payload público.
  if auth.uid() is not null and (
    coalesce(p_payload,'{}'::jsonb) ?| array['service_origin','service_boundary']
    or coalesce(p_metadata,'{}'::jsonb) ?| array['service_origin','service_boundary']
  ) then raise exception 'reserved_service_origin' using errcode='42501'; end if;
  v_org_id := coalesce(p_organization_id, (public.fn_support_context()->>'organization_id')::uuid);
  if v_org_id is null then
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;

  if auth.uid() is not null
     and not public.fn_role_at_least(v_org_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'emit_event: caller must be an active member of the organization';
  end if;

  -- 9054: `lead.*` dispara conversão de anúncio, automação e cadência. Quem só lê
  -- (viewer) não emite; agent+ e o servidor (sem sessão) seguem emitindo.
  if auth.uid() is not null and p_event_type like 'lead.%'
     and not public.fn_role_at_least(v_org_id, 'agent') then
    raise exception 'caller_not_authorized_for_event' using errcode='42501',
      hint = 'emit_event: lead.* exige agent+';
  end if;

  if not public.fn_support_write_allowed(v_org_id) then raise exception 'support_readonly' using errcode='42501'; end if;

  -- A origem é reservada ao servidor, então o servidor a escreve (0223/0279):
  -- o retrato do atendimento no instante da emissão.
  if not (coalesce(p_payload,'{}'::jsonb) ? 'service_origin')
     and not (coalesce(p_metadata,'{}'::jsonb) ? 'service_origin') then
    if p_event_type in ('lead.created','lead.stage_changed','lead.tag_added') and p_entity_kind='crm_lead' then
      select contact_id into v_contact from public.crm_leads where organization_id=v_org_id and id=p_entity_id;
    elsif p_event_type='contact.tag_added' and p_entity_kind='contact' then
      select id into v_contact from public.contacts where organization_id=v_org_id and id=p_entity_id;
    end if;
    if v_contact is not null
       and exists(select 1 from public.contacts
                   where organization_id=v_org_id and id=v_contact
                     and not is_anonymized and is_merged_into is null) then
      v_origin := jsonb_build_object('kind','command',
        'observed', public.fn_service_observe_command(v_org_id, v_contact));
    end if;
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb)
       || case when v_origin is null then '{}'::jsonb else jsonb_build_object('service_origin', v_origin) end,
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;

  return v_event_id;
end $function$;
revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) from public, anon;
grant  execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
